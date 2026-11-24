import { query } from './db';

export async function ensureInvoiceCancellationSchema() {
  if (!globalThis.__teakwoodCancellationSchema) {
    globalThis.__teakwoodCancellationSchema = (async () => {
      const columns = await query("SHOW COLUMNS FROM tblInvoiceHeader LIKE 'CancelledAt'");
      if (!columns.length) {
        try { await query('ALTER TABLE tblInvoiceHeader ADD COLUMN CancelledAt DATETIME NULL'); }
        catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
      }
      await query(`CREATE TABLE IF NOT EXISTS webInvoiceCancellations (
        InvoiceID BIGINT NOT NULL PRIMARY KEY, InvoiceNo VARCHAR(255) NOT NULL,
        SnapshotJson LONGTEXT NOT NULL, DispatchJson LONGTEXT NOT NULL,
        CancelledBy VARCHAR(255) NOT NULL, CancelledAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    })().catch(error => { delete globalThis.__teakwoodCancellationSchema; throw error; });
  }
  return globalThis.__teakwoodCancellationSchema;
}
