import { query } from './db';

// Additive only: existing PO and invoice values are left intact.
export async function ensureBuyingTaxColumns(table = 'tblPODetails', run = query) {
  if (!['tblPODetails', 'webTmpPODetails'].includes(table)) throw new Error('Invalid PO tax table.');
  const columns = await run(`SELECT COLUMN_NAME AS columnName FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [table]);
  const names = new Set(columns.map(row => String(row.columnName).toLowerCase()));
  for (const name of ['BuyingTaxCGST', 'BuyingTaxIGST', 'BuyingTaxSGST']) {
    if (!names.has(name.toLowerCase())) {
      try {
        await run(`ALTER TABLE ${table} ADD COLUMN ${name} DECIMAL(18,2) NULL DEFAULT 0`);
      } catch (error) {
        // Another request may have added the same column after our schema read.
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    }
  }
}
