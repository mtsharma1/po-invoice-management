import { query } from './db';

export async function ensureInvoiceTaxVersionColumn() {
  if (!globalThis.__teakwoodInvoiceTaxVersionSchema) {
    globalThis.__teakwoodInvoiceTaxVersionSchema = applySchema().catch((error) => {
      delete globalThis.__teakwoodInvoiceTaxVersionSchema;
      throw error;
    });
  }
  return globalThis.__teakwoodInvoiceTaxVersionSchema;
}

async function applySchema() {
  const columns = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tblInvoiceHeader'
       AND COLUMN_NAME = 'TaxDetailsVersion'`
  );
  if (!columns.length) {
    try {
      // Existing invoices stay at version 0. Only creation paths opt in to 1.
      await query('ALTER TABLE tblInvoiceHeader ADD COLUMN TaxDetailsVersion TINYINT NOT NULL DEFAULT 0');
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}
