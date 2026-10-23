import { query } from './db';

export async function ensureInvoiceTransportationColumn() {
  if (!globalThis.__teakwoodInvoiceTransportationSchema) {
    globalThis.__teakwoodInvoiceTransportationSchema = (async () => {
      const columns = await query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tblInvoiceHeader'
        AND COLUMN_NAME = 'TransportationCharges'`);
      if (columns.length) return;
      try {
        await query(`ALTER TABLE tblInvoiceHeader
          ADD COLUMN TransportationCharges DECIMAL(18,2) NOT NULL DEFAULT 0`);
      } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    })().catch((error) => {
      delete globalThis.__teakwoodInvoiceTransportationSchema;
      throw error;
    });
  }
  return globalThis.__teakwoodInvoiceTransportationSchema;
}
