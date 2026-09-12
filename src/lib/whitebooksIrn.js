import { createHash } from 'node:crypto';
import { query } from './db';
import { prepareEInvoice } from './eInvoice';
import { authenticateWhitebooks, generateWhitebooksIrn, WhitebooksError } from './whitebooks';

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS webWhitebooksSandboxIrn (
    InvoiceNo VARCHAR(255) NOT NULL PRIMARY KEY,
    DocumentKey CHAR(64) NOT NULL UNIQUE,
    State VARCHAR(20) NOT NULL,
    RequestJson LONGTEXT NOT NULL,
    ResultJson LONGTEXT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

export async function getSandboxIrn(invoiceNo) {
  await ensureTable();
  const rows = await query('SELECT State, ResultJson FROM webWhitebooksSandboxIrn WHERE InvoiceNo = ?', [invoiceNo]);
  if (!rows.length) return null;
  return { state: rows[0].State, result: rows[0].ResultJson ? JSON.parse(rows[0].ResultJson) : null };
}

export async function generateSandboxIrn(invoiceNo, draft) {
  const prepared = await prepareEInvoice(invoiceNo, draft);
  if (!prepared.valid) return { ok: false, error: 'Correct invoice validation errors before generating IRN.', validation: prepared };
  if (prepared.hasIrn) throw new WhitebooksError('This invoice already has a production IRN.');
  const document = prepared.document;
  if (document.SellerDtls.Gstin !== process.env.WHITEBOOKS_GSTIN?.trim()) {
    throw new WhitebooksError('Seller GSTIN must match the configured WhiteBooks sandbox GSTIN.');
  }
  const existing = await getSandboxIrn(invoiceNo);
  if (existing?.state === 'succeeded') return { ok: true, ...existing };
  if (existing) throw new WhitebooksError('A previous submission is pending or uncertain. Reconcile it in WhiteBooks before another submission.');

  const { authToken } = await authenticateWhitebooks();
  const [, month, year] = document.DocDtls.Dt.split('/').map(Number);
  const financialYear = month >= 4 ? year : year - 1;
  const documentKey = createHash('sha256').update(JSON.stringify([
    document.SellerDtls.Gstin, financialYear, document.DocDtls.Typ, document.DocDtls.No.toUpperCase(),
  ])).digest('hex');
  try {
    // A durable unique reservation prevents simultaneous requests across server workers.
    await query('INSERT INTO webWhitebooksSandboxIrn (InvoiceNo, DocumentKey, State, RequestJson) VALUES (?, ?, ?, ?)',
      [invoiceNo, documentKey, 'pending', JSON.stringify(document)]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new WhitebooksError('This invoice or document already has a submission. Refresh to see its status.');
    throw error;
  }
  let result;
  try {
    result = await generateWhitebooksIrn(document, authToken);
    await query('UPDATE webWhitebooksSandboxIrn SET State = ?, ResultJson = ? WHERE InvoiceNo = ?',
      ['succeeded', JSON.stringify(result), invoiceNo]);
  } catch (error) {
    await query('UPDATE webWhitebooksSandboxIrn SET State = ? WHERE InvoiceNo = ?', ['uncertain', invoiceNo]).catch(() => {});
    if (result) return { ok: true, state: 'uncertain', result, warning: 'IRN generated but saving failed. Download the result now and reconcile in WhiteBooks. Do not resubmit.' };
    throw error;
  }
  return { ok: true, state: 'succeeded', result };
}
