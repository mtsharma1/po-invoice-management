// Discover references in the installed database, including optional application tables.
const identifier = value => '`' + String(value).replaceAll('`', '``') + '`';

export async function renameInvoiceReferences(run, saved, nextNumber) {
  if (saved.InvoiceNo === nextNumber) return;
  if (!/^[A-Za-z0-9][A-Za-z0-9/-]{0,15}$/.test(nextNumber)) {
    throw new Error('Invoice number must contain 1–16 letters, numbers, / or -, starting with a letter or number.');
  }
  if (saved.IRN && !['null', 'undefined'].includes(String(saved.IRN).trim().toLowerCase())) {
    throw new Error('Invoice number cannot change after IRN generation.');
  }
  const headers = await run('SELECT InvoiceID FROM tblInvoiceHeader WHERE InvoiceNo = ? FOR UPDATE', [saved.InvoiceNo]);
  if (headers.length !== 1) throw new Error('This invoice number has multiple headers. Resolve the duplicate records before renaming.');
  const columns = await run(`SELECT c.TABLE_NAME, c.COLUMN_NAME, c.CHARACTER_MAXIMUM_LENGTH, t.ENGINE
    FROM information_schema.COLUMNS c JOIN information_schema.TABLES t
      ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
    WHERE c.TABLE_SCHEMA = DATABASE() AND t.TABLE_TYPE = 'BASE TABLE'
      AND LOWER(c.COLUMN_NAME) IN ('invoiceno', 'invoicenumber')`);
  for (const column of columns) {
    if (column.ENGINE !== 'InnoDB') throw new Error(`Invoice references in ${column.TABLE_NAME} require transactional storage before renaming.`);
    if (column.CHARACTER_MAXIMUM_LENGTH && nextNumber.length > Number(column.CHARACTER_MAXIMUM_LENGTH)) {
      throw new Error(`Invoice number must contain at most ${column.CHARACTER_MAXIMUM_LENGTH} characters.`);
    }
    if (/whitebooks|cancellation/i.test(column.TABLE_NAME)) {
      const records = await run(`SELECT 1 FROM ${identifier(column.TABLE_NAME)} WHERE ${identifier(column.COLUMN_NAME)} = ? LIMIT 1 FOR UPDATE`, [saved.InvoiceNo]);
      if (records.length) throw new Error('Invoice number is locked by an IRN, e-way bill or cancellation record. Resolve its status before renaming.');
    }
    if (column.TABLE_NAME !== 'tblInvoiceHeader') {
      const duplicate = await run(`SELECT 1 FROM ${identifier(column.TABLE_NAME)} WHERE LOWER(TRIM(${identifier(column.COLUMN_NAME)})) = LOWER(?) AND LOWER(TRIM(${identifier(column.COLUMN_NAME)})) <> LOWER(?) LIMIT 1`, [nextNumber, saved.InvoiceNo]);
      if (duplicate.length) throw new Error('This invoice number is already used by another invoice record.');
    }
  }
  // Tax candidates are unregistered JSON drafts. Remove them so they are regenerated under the new number.
  if (columns.some(column => column.TABLE_NAME === 'webInvoiceTaxSnapshots')) {
    const frozen = await run("SELECT 1 FROM webInvoiceTaxSnapshots WHERE InvoiceNo = ? AND LOWER(TRIM(COALESCE(IRN, ''))) NOT IN ('', 'null', 'undefined') FOR UPDATE", [saved.InvoiceNo]);
    if (frozen.length) throw new Error('Invoice number cannot change after IRN generation.');
    await run('DELETE FROM webInvoiceTaxSnapshots WHERE InvoiceNo = ?', [saved.InvoiceNo]);
  }
  for (const column of columns) {
    if (column.TABLE_NAME === 'tblInvoiceHeader') continue;
    await run(`UPDATE ${identifier(column.TABLE_NAME)} SET ${identifier(column.COLUMN_NAME)} = ? WHERE ${identifier(column.COLUMN_NAME)} = ?`,
      [nextNumber, saved.InvoiceNo]);
  }
}
