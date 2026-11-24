import { saveProductionIrnFields } from './productionIrnSave';
import { ensureInvoiceTaxSnapshots, saveTaxCandidate } from './invoiceTaxSnapshot';
import { createHash } from 'node:crypto';
import { query, withTransaction } from './db';
import { getInvoice } from './invoices';
import { prepareEInvoiceFromInvoice } from './eInvoice';
import { assertCurrentIrnQuantities, InvoiceQuantityError, quantityInvoiceHeader } from './invoiceQuantities';
import { authenticateWhitebooks, generateWhitebooksIrn, getWhitebooksIrnByDocument, getEInvoiceConfig, WhitebooksError, WhitebooksIrnRejection } from './whitebooks';

async function ensureTable() {
  await ensureInvoiceTaxSnapshots();
  await query(`CREATE TABLE IF NOT EXISTS webWhitebooksProductionIrn (
    InvoiceNo VARCHAR(255) NOT NULL PRIMARY KEY, DocumentKey CHAR(64) NOT NULL UNIQUE,
    InvoiceID BIGINT NOT NULL, State VARCHAR(20) NOT NULL,
    RequestJson LONGTEXT NOT NULL, ResultJson LONGTEXT NULL,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}
export async function getProductionIrn(invoiceNo) {
  await ensureTable();
  const rows = await query('SELECT State, ResultJson FROM webWhitebooksProductionIrn WHERE InvoiceNo = ?', [invoiceNo]);
  return rows.length ? { state: rows[0].State, result: rows[0].ResultJson ? JSON.parse(rows[0].ResultJson) : null } : null;
}
async function applyResult(invoiceNo, result) {
  await withTransaction(run => saveProductionIrnFields(run, invoiceNo, result));
}
export async function generateProductionIrn(invoiceNo, draft) {
  const currentInvoice = await getInvoice(invoiceNo);
  if (currentInvoice.header?.CancelledAt) throw new WhitebooksError('Cancelled invoices cannot generate IRNs.');
  const existing = await getProductionIrn(invoiceNo);
  if (['cancelled','canceled'].includes(String(existing?.state || '').toLowerCase())
    || ['CNL','CANCELLED','CANCELED'].includes(String(existing?.result?.Status || '').toUpperCase())) {
    throw new WhitebooksError('This invoice has a cancelled IRN. Its registered tax rates remain frozen.');
  }
  if (existing?.result) {
    await applyResult(invoiceNo, existing.result);
    return { ok: true, state: 'succeeded', result: existing.result };
  }
  if (existing && !['rejected', 'retryable'].includes(existing.state)) throw new WhitebooksError('A production request is pending or uncertain. Check IRN status before resubmitting.');
  const invoice = await getInvoice(invoiceNo);
  const prepared = prepareEInvoiceFromInvoice(invoice, draft);
  if (!prepared.valid) return { ok: false, error: 'Correct invoice validation errors first.', validation: prepared };
  if (prepared.hasIrn) throw new WhitebooksError('This invoice already has an IRN.');
  const document = prepared.document;
  if (document.SellerDtls.Gstin !== getEInvoiceConfig('production').values.gstin?.trim()) throw new WhitebooksError('Seller GSTIN must match the production GSTIN.');
  if (document.DocDtls.No !== invoice.header.InvoiceNo) throw new WhitebooksError('Production document number must match the selected invoice.');
  const { authToken } = await authenticateWhitebooks('production');
  const [, month, year] = document.DocDtls.Dt.split('/').map(Number);
  const key = createHash('sha256').update(JSON.stringify([document.SellerDtls.Gstin, month >= 4 ? year : year - 1, document.DocDtls.Typ, document.DocDtls.No.toUpperCase()])).digest('hex');
  try {
    await withTransaction(async run => {
      const header = await quantityInvoiceHeader(run, invoiceNo, true);
      await assertCurrentIrnQuantities(run, header, invoice);
      if (existing) {
        const reserved = await run(`UPDATE webWhitebooksProductionIrn SET DocumentKey = ?, State = 'pending', RequestJson = ?, UpdatedAt = CURRENT_TIMESTAMP
          WHERE InvoiceNo = ? AND InvoiceID = ? AND State IN ('rejected', 'retryable') AND ResultJson IS NULL`,
        [key, JSON.stringify(document), invoiceNo, invoice.header.InvoiceID]);
        if (reserved.affectedRows !== 1) throw new WhitebooksError('Submission status changed. Refresh before generating.');
      } else {
        await run('INSERT INTO webWhitebooksProductionIrn (InvoiceNo, DocumentKey, InvoiceID, State, RequestJson) VALUES (?, ?, ?, ?, ?)', [invoiceNo, key, invoice.header.InvoiceID, 'pending', JSON.stringify(document)]);
      }
      await saveTaxCandidate(run,invoice,document);
    });
  } catch (error) {
    if (error instanceof InvoiceQuantityError) throw new WhitebooksError(error.message);
    if (error.code === 'ER_DUP_ENTRY') throw new WhitebooksError('A production submission already exists. Refresh the invoice.');
    throw error;
  }
  let result;
  try {
    result = await generateWhitebooksIrn(document, authToken, 'production');
    // Persist the provider result before touching the invoice, so saving can be retried without generation.
    await query('UPDATE webWhitebooksProductionIrn SET State = ?, ResultJson = ? WHERE InvoiceNo = ?', ['generated', JSON.stringify(result), invoiceNo]);
    await applyResult(invoiceNo, result);
  } catch (error) {
    if (result) return { ok: true, state: 'generated', result, warning: 'IRN generated but invoice saving needs recovery. Download this result. Use Save generated IRN to retry saving without generating again.' };
    if (error instanceof WhitebooksIrnRejection) {
      const saved = await query("UPDATE webWhitebooksProductionIrn SET State = ? WHERE InvoiceNo = ? AND State = 'pending' AND ResultJson IS NULL", ['rejected', invoiceNo]);
      if (saved.affectedRows !== 1) throw new WhitebooksError('Could not save the rejection status. Check IRN status before retrying.');
      return { ok: false, state: 'rejected', error: error.message };
    }
    await query('UPDATE webWhitebooksProductionIrn SET State = ? WHERE InvoiceNo = ?', ['uncertain', invoiceNo]).catch(() => {});
    throw error;
  }
  return { ok: true, state: 'succeeded', result };
}

export async function reconcileProductionIrn(invoiceNo) {
  await ensureTable();
  const [record] = await query(`SELECT InvoiceID, State, RequestJson, ResultJson, UpdatedAt,
    TIMESTAMPDIFF(SECOND, UpdatedAt, CURRENT_TIMESTAMP) AS AgeSeconds
    FROM webWhitebooksProductionIrn WHERE InvoiceNo = ?`, [invoiceNo]);
  if (!record) return { ok: true, state: 'not_submitted', result: null };
  if (['cancelled', 'canceled'].includes(record.State)) throw new WhitebooksError('This IRN is cancelled. It cannot be generated again.');
  if (record.ResultJson) {
    const result = JSON.parse(record.ResultJson);
    if (result.Status && result.Status !== 'ACT') throw new WhitebooksError('The saved IRN is not active.');
    await applyResult(invoiceNo, result);
    return { ok: true, state: 'succeeded', result };
  }
  if (['rejected', 'retryable'].includes(record.State)) return { ok: true, state: record.State, result: null };
  if (!['pending', 'uncertain'].includes(record.State)) throw new WhitebooksError('Submission status needs review.');
  if (Number(record.AgeSeconds) < 300) throw new WhitebooksError('The previous request is recent. Wait five minutes before checking IRN status.');
  const document = JSON.parse(record.RequestJson);
  const invoice = await getInvoice(invoiceNo);
  if (Number(invoice.header?.InvoiceID) !== Number(record.InvoiceID) || invoice.header?.CancelledAt) throw new WhitebooksError('The saved submission no longer matches an active invoice.');
  const auth = await authenticateWhitebooks('production');
  auth.irp ||= process.env.WHITEBOOKS_PRODUCTION_IRP?.trim();
  const result = await getWhitebooksIrnByDocument(document, auth, 'production');
  if (!result) {
    // Lookup availability is time-limited. An older not-found response is not
    // proof of absence, so never unlock historical submissions automatically.
    if (Number(record.AgeSeconds) > 48 * 3600) throw new WhitebooksError('The submission is older than the reliable lookup window. Verify its document details on the portal; automatic retry remains blocked.');
    const stored = String(invoice.header.IRN || '').trim().toLowerCase();
    if (stored && !['null', 'undefined'].includes(stored)) throw new WhitebooksError('The invoice already contains an IRN. Reconcile it before retrying.');
  }
  const state = result ? 'generated' : 'retryable';
  const saved = await query(`UPDATE webWhitebooksProductionIrn SET State = ?, ResultJson = ?, UpdatedAt = CURRENT_TIMESTAMP
    WHERE InvoiceNo = ? AND InvoiceID = ? AND State = ? AND RequestJson = ? AND UpdatedAt = ? AND ResultJson IS NULL`,
  [state, result ? JSON.stringify(result) : null, invoiceNo, record.InvoiceID, record.State, record.RequestJson, record.UpdatedAt]);
  if (saved.affectedRows !== 1) throw new WhitebooksError('Submission status changed. Refresh and check again.');
  if (result) {
    try { await applyResult(invoiceNo, result); }
    catch { return { ok: true, state: 'generated', result, warning: 'IRN recovered. Use Save generated IRN to retry saving its invoice fields.' }; }
  }
  return { ok: true, state: result ? 'succeeded' : 'retryable', result };
}
