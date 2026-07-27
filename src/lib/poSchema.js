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

export async function ensurePODetailImageColumns() {
  if (!globalForPOSchema.__teakwoodPODetailImageSchema) {
    globalForPOSchema.__teakwoodPODetailImageSchema = applyPODetailImageSchema().catch((error) => {
      delete globalForPOSchema.__teakwoodPODetailImageSchema;
      throw error;
    });
  }

  return globalForPOSchema.__teakwoodPODetailImageSchema;
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

async function applyPODetailImageSchema() {
  const rows = await query(
    `SELECT COLUMN_NAME AS columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tblPODetails'
       AND COLUMN_NAME IN ('path_display', 'ImageUrl')`
  );
  const columns = new Set(rows.map((row) => String(row.columnName).toLowerCase()));

  if (!columns.has('path_display')) {
    await query(
      `ALTER TABLE tblPODetails
       ADD COLUMN path_display VARCHAR(1024) NULL AFTER AvailableStock`
    );
  }
  if (!columns.has('imageurl')) {
    await query(
      `ALTER TABLE tblPODetails
       ADD COLUMN ImageUrl VARCHAR(2048) NULL AFTER path_display`
    );
  }
}
