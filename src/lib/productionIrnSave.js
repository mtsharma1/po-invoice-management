export function normalizeStoredIrn(value) {
  const text = String(value ?? '').trim();
  return ['null', 'undefined'].includes(text.toLowerCase()) ? '' : text.replace(/\s+/g, '').toLowerCase();
}

// Caller supplies a transaction-bound query function. This never calls WhiteBooks.
export async function saveProductionIrnFields(run, invoiceNo, result) {
  const irn = normalizeStoredIrn(result?.Irn);
  if (!/^[a-f0-9]{64}$/.test(irn) || !/^\d+$/.test(String(result?.AckNo || ''))) throw new Error('Invalid saved IRN or acknowledgement number.');
  const ackDate = String(result.AckDt || '').trim().replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ackDate)) throw new Error('Invalid acknowledgement date; invoice fields were not changed.');
  const records = await run('SELECT InvoiceID FROM webWhitebooksProductionIrn WHERE InvoiceNo = ? FOR UPDATE', [invoiceNo]);
  if (!records.length) throw new Error('Saved production submission not found.');
  const id = records[0].InvoiceID;
  const headers = await run('SELECT IRN, AckNo, AckDate FROM tblInvoiceHeader WHERE InvoiceID = ? AND InvoiceNo = ? FOR UPDATE', [id, invoiceNo]);
  if (!headers.length) throw new Error('Selected invoice no longer matches the saved submission.');
  const header = headers[0];
  const current = normalizeStoredIrn(header.IRN);
  if (current && current !== irn) throw new Error('Invoice already has a different IRN; existing details were preserved.');
  // Avoid rewriting manually entered details that already match the provider response.
  if (current !== irn || String(header.AckNo || '') !== String(result.AckNo) || String(header.AckDate || '') !== ackDate) {
    const update = await run('UPDATE tblInvoiceHeader SET IRN = ?, AckNo = ?, AckDate = ? WHERE InvoiceID = ? AND InvoiceNo = ?', [irn, String(result.AckNo), ackDate, id, invoiceNo]);
    if (update.affectedRows !== 1) throw new Error('Invoice update did not match exactly one record.');
  }
  await run('UPDATE webWhitebooksProductionIrn SET State = ? WHERE InvoiceNo = ?', ['succeeded', invoiceNo]);
}
