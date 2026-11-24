exports.up = async ({ ensureColumn, query }) => {
  await ensureColumn('tblInvoiceHeader', 'CancelledAt', 'DATETIME NULL');
  await query(`CREATE TABLE IF NOT EXISTS webInvoiceCancellations (
    InvoiceID BIGINT NOT NULL PRIMARY KEY, InvoiceNo VARCHAR(255) NOT NULL,
    SnapshotJson LONGTEXT NOT NULL, DispatchJson LONGTEXT NOT NULL,
    CancelledBy VARCHAR(255) NOT NULL, CancelledAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};
