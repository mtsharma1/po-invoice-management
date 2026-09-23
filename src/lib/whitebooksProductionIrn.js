import { saveProductionIrnFields } from './productionIrnSave';
import { createHash } from 'node:crypto';
import { query, withTransaction } from './db';
import { getInvoice } from './invoices';
import { prepareEInvoice } from './eInvoice';
import { authenticateWhitebooks, generateWhitebooksIrn, getEInvoiceConfig, WhitebooksError } from './whitebooks';

async function ensureTable() {
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
  const existing = await getProductionIrn(invoiceNo);
  if (existing?.result) {
    await applyResult(invoiceNo, existing.result);
    return { ok: true, state: 'succeeded', result: existing.result };
  }
  if (existing) throw new WhitebooksError('A production request is pending or uncertain. Check WhiteBooks before resubmitting.');
  const invoice = await getInvoice(invoiceNo);
  const prepared = await prepareEInvoice(invoiceNo, draft);
  if (!prepared.valid) return { ok: false, error: 'Correct invoice validation errors first.', validation: prepared };
  if (prepared.hasIrn) throw new WhitebooksError('This invoice already has an IRN.');
  const document = prepared.document;
  if (document.SellerDtls.Gstin !== getEInvoiceConfig('production').values.gstin?.trim()) throw new WhitebooksError('Seller GSTIN must match the production GSTIN.');
  if (document.DocDtls.No !== invoice.header.InvoiceNo) throw new WhitebooksError('Production document number must match the selected invoice.');
  const { authToken } = await authenticateWhitebooks('production');
  const [, month, year] = document.DocDtls.Dt.split('/').map(Number);
  const key = createHash('sha256').update(JSON.stringify([document.SellerDtls.Gstin, month >= 4 ? year : year - 1, document.DocDtls.Typ, document.DocDtls.No.toUpperCase()])).digest('hex');
  try {
    await query('INSERT INTO webWhitebooksProductionIrn (InvoiceNo, DocumentKey, InvoiceID, State, RequestJson) VALUES (?, ?, ?, ?, ?)', [invoiceNo, key, invoice.header.InvoiceID, 'pending', JSON.stringify(document)]);
  } catch (error) {
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
    await query('UPDATE webWhitebooksProductionIrn SET State = ? WHERE InvoiceNo = ?', ['uncertain', invoiceNo]).catch(() => {});
    throw error;
  }
  return { ok: true, state: 'succeeded', result };
}
