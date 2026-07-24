import { query } from './db';

const globalForPOSchema = globalThis;

export async function ensurePOImportDateColumn() {
  if (!globalForPOSchema.__teakwoodPOImportDateSchema) {
    globalForPOSchema.__teakwoodPOImportDateSchema = applyPOImportDateSchema().catch((error) => {
      delete globalForPOSchema.__teakwoodPOImportDateSchema;
      throw error;
    });
  }

  return globalForPOSchema.__teakwoodPOImportDateSchema;
}

async function applyPOImportDateSchema() {
  const rows = await query(
    `SELECT COLUMN_DEFAULT AS columnDefault
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tblPOHeaders'
       AND COLUMN_NAME = 'POImportDate'`
  );

  if (!rows.length) {
    await query(
      `ALTER TABLE tblPOHeaders
       ADD COLUMN POImportDate DATETIME NULL DEFAULT CURRENT_TIMESTAMP AFTER CreatedOn`
    );
  } else if (!rows[0].columnDefault) {
    await query(
      `ALTER TABLE tblPOHeaders
       MODIFY COLUMN POImportDate DATETIME NULL DEFAULT CURRENT_TIMESTAMP`
    );
  }

  await query(
    `UPDATE tblPOHeaders
     SET POImportDate = COALESCE(CreatedOn, POApprovedDate, CURRENT_TIMESTAMP)
     WHERE POImportDate IS NULL`
  );
}
