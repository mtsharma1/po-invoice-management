import { query } from './db';

const globalForImportLogs = globalThis;

export async function ensurePOImportErrorLogTable() {
  if (!globalForImportLogs.__teakwoodPOImportErrorLogSchema) {
    globalForImportLogs.__teakwoodPOImportErrorLogSchema = query(
      `CREATE TABLE IF NOT EXISTS webPOImportErrorLogs (
         ErrorLogID BIGINT NOT NULL AUTO_INCREMENT,
         BatchID VARCHAR(64) NOT NULL,
         FileName VARCHAR(255) NOT NULL,
         POBarcode VARCHAR(50) NULL,
         WorksheetName VARCHAR(255) NULL,
         ExcelRow INT NULL,
         FieldName VARCHAR(255) NULL,
         FailureReason TEXT NOT NULL,
         ErrorDateTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (ErrorLogID),
         INDEX IX_webPOImportErrorLogs_BatchID (BatchID),
         INDEX IX_webPOImportErrorLogs_FileName (FileName),
         INDEX IX_webPOImportErrorLogs_ErrorDateTime (ErrorDateTime)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    ).catch((error) => {
      delete globalForImportLogs.__teakwoodPOImportErrorLogSchema;
      throw error;
    });
  }
  return globalForImportLogs.__teakwoodPOImportErrorLogSchema;
}

export async function recordPOImportErrors(entries) {
  if (!Array.isArray(entries) || !entries.length) return 0;
  await ensurePOImportErrorLogTable();
  const values = entries.map((entry) => [
    String(entry.batchId || 'UNASSIGNED').slice(0, 64),
    String(entry.fileName || 'Unknown file').slice(0, 255),
    nullableText(entry.poBarcode, 50),
    nullableText(entry.worksheet, 255),
    positiveIntegerOrNull(entry.row),
    nullableText(entry.field, 255),
    String(entry.reason || 'Import failed.'),
    validDate(entry.dateTime),
  ]);
  const result = await query(
    `INSERT INTO webPOImportErrorLogs
       (BatchID, FileName, POBarcode, WorksheetName, ExcelRow, FieldName, FailureReason, ErrorDateTime)
     VALUES ?`,
    [values]
  );
  return Number(result.affectedRows || 0);
}

export async function getPOImportErrorLogs(limit = 500) {
  await ensurePOImportErrorLogTable();
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  return query(
    `SELECT
       ErrorLogID AS errorLogId,
       BatchID AS batchId,
       FileName AS fileName,
       COALESCE(POBarcode, '') AS poBarcode,
       COALESCE(WorksheetName, '') AS worksheet,
       ExcelRow AS excelRow,
       COALESCE(FieldName, '') AS field,
       FailureReason AS reason,
       ErrorDateTime AS dateTime
     FROM webPOImportErrorLogs
     ORDER BY ErrorLogID DESC
     LIMIT ${safeLimit}`
  );
}

function nullableText(value, maxLength) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function positiveIntegerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function validDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
