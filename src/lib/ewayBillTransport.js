import { query } from './db';
import { WhitebooksError } from './whitebooks';

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS webInvoiceEwayBillTransport (
    InvoiceNo VARCHAR(255) NOT NULL PRIMARY KEY,
    TransportJson TEXT NOT NULL,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

// Save incomplete input too: generation performs the full transport validation.
export function normalizeTransport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new WhitebooksError('Transport details are required.');
  const result = {};
  for (const key of ['TransId', 'TransName', 'Distance', 'TransDocNo', 'TransDocDt', 'VehNo', 'VehType', 'TransMode']) {
    const value = input[key] ?? '';
    if (!['string', 'number'].includes(typeof value) || String(value).length > 200) throw new WhitebooksError('Transport details contain an invalid value.');
    result[key] = String(value).trim();
  }
  return result;
}

export async function getEwayBillTransport(invoiceNo) {
  await ensureTable();
  const rows = await query('SELECT TransportJson FROM webInvoiceEwayBillTransport WHERE InvoiceNo = ?', [invoiceNo]);
  return rows.length ? normalizeTransport(JSON.parse(rows[0].TransportJson)) : null;
}

export async function saveEwayBillTransport(invoiceNo, input) {
  const transport = normalizeTransport(input);
  const invoices = await query('SELECT InvoiceNo FROM tblInvoiceHeader WHERE InvoiceNo = ?', [invoiceNo]);
  if (invoices.length !== 1) throw new WhitebooksError('A unique invoice is required to save transport details.');
  await ensureTable();
  await query(`INSERT INTO webInvoiceEwayBillTransport (InvoiceNo, TransportJson) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE TransportJson = VALUES(TransportJson)`, [invoiceNo, JSON.stringify(transport)]);
  return transport;
}
