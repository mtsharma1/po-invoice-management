import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { query } from './db';

const PO_TEMPLATE_KEY = 'po-upload';
const PO_TEMPLATE_FILE_NAME = 'PO Upload Template.xlsx';
const EXCEL_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function ensureFileTemplatesTable(run = query) {
  await run(
    `CREATE TABLE IF NOT EXISTS webFileTemplates (
       TemplateKey VARCHAR(100) NOT NULL,
       FileName VARCHAR(255) NOT NULL,
       MimeType VARCHAR(150) NOT NULL,
       FileData LONGBLOB NOT NULL,
       FileSize BIGINT UNSIGNED NOT NULL,
       FileHash CHAR(64) NOT NULL,
       CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (TemplateKey)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

export async function ensurePOTemplateRecord(run = query) {
  await ensureFileTemplatesTable(run);

  const existing = await run(
    `SELECT TemplateKey
     FROM webFileTemplates
     WHERE TemplateKey = ?
     LIMIT 1`,
    [PO_TEMPLATE_KEY]
  );
  if (existing.length) return;

  const fileData = await readBundledPOTemplate();
  const fileHash = createHash('sha256').update(fileData).digest('hex');

  await run(
    `INSERT IGNORE INTO webFileTemplates
       (TemplateKey, FileName, MimeType, FileData, FileSize, FileHash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      PO_TEMPLATE_KEY,
      PO_TEMPLATE_FILE_NAME,
      EXCEL_MIME_TYPE,
      fileData,
      fileData.length,
      fileHash,
    ]
  );
}

export async function getPOTemplateFromDatabase() {
  await ensurePOTemplateRecord();

  const rows = await query(
    `SELECT FileName, MimeType, FileData, FileSize, FileHash
     FROM webFileTemplates
     WHERE TemplateKey = ?
     LIMIT 1`,
    [PO_TEMPLATE_KEY]
  );
  if (!rows.length) {
    throw new Error('The PO upload template is not available in the database.');
  }

  const row = rows[0];
  const fileData = Buffer.isBuffer(row.FileData)
    ? row.FileData
    : Buffer.from(row.FileData || []);
  if (!fileData.length) {
    throw new Error('The PO upload template stored in the database is empty.');
  }

  return {
    fileName: row.FileName || PO_TEMPLATE_FILE_NAME,
    mimeType: row.MimeType || EXCEL_MIME_TYPE,
    fileData,
    fileSize: Number(row.FileSize || fileData.length),
    fileHash: row.FileHash || '',
  };
}

export async function readBundledPOTemplate() {
  return readFile(
    path.resolve(process.cwd(), 'public', 'templates', PO_TEMPLATE_FILE_NAME)
  );
}

export const poTemplateDefaults = {
  key: PO_TEMPLATE_KEY,
  fileName: PO_TEMPLATE_FILE_NAME,
  mimeType: EXCEL_MIME_TYPE,
};
