import { query } from './db';

export async function ensureInvoicePresentationColumns() {
  if (!globalThis.__teakwoodInvoicePresentationSchema) {
    globalThis.__teakwoodInvoicePresentationSchema = (async () => {
      const columns = await query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tblInvoiceHeader'
        AND COLUMN_NAME IN ('InvoiceNote', 'BeneficiaryName')`);
      const existing = new Set(columns.map((row) => row.COLUMN_NAME));
      for (const [name, type] of [['InvoiceNote', 'TEXT'], ['BeneficiaryName', 'VARCHAR(255)']]) {
        if (existing.has(name)) continue;
        try {
          await query(`ALTER TABLE tblInvoiceHeader ADD COLUMN ${name} ${type} NULL`);
        } catch (error) {
          if (error.code !== 'ER_DUP_FIELDNAME') throw error;
        }
      }
    })().catch((error) => {
      delete globalThis.__teakwoodInvoicePresentationSchema;
      throw error;
    });
  }
  return globalThis.__teakwoodInvoicePresentationSchema;
}
