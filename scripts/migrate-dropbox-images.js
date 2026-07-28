const { loadEnvConfig } = require('@next/env');
const mysql = require('mysql2/promise');

loadEnvConfig(process.cwd());

async function main() {
  const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing environment values: ${missing.join(', ')}`);

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
  });

  try {
    const [rows] = await connection.query(
      `SELECT COLUMN_NAME AS columnName
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'tblPODetails'
         AND COLUMN_NAME IN ('path_display', 'ImageUrl', 'ImageData', 'ImageData2', 'ImageData3')`
    );
    const columns = new Set(rows.map((row) => String(row.columnName).toLowerCase()));

    if (!columns.has('path_display')) {
      await connection.query(
        `ALTER TABLE tblPODetails
         ADD COLUMN path_display VARCHAR(1024) NULL AFTER AvailableStock`
      );
      console.log('Added tblPODetails.path_display');
    }
    if (!columns.has('imageurl')) {
      await connection.query(
        `ALTER TABLE tblPODetails
         ADD COLUMN ImageUrl VARCHAR(2048) NULL AFTER path_display`
      );
      console.log('Added tblPODetails.ImageUrl');
    }
    if (!columns.has('imagedata')) {
      await connection.query(
        `ALTER TABLE tblPODetails
         ADD COLUMN ImageData LONGBLOB NULL AFTER ImageUrl`
      );
      console.log('Added tblPODetails.ImageData');
    }
    if (!columns.has('imagedata2')) {
      await connection.query(
        `ALTER TABLE tblPODetails
         ADD COLUMN ImageData2 LONGBLOB NULL AFTER ImageData`
      );
      console.log('Added tblPODetails.ImageData2');
    }
    if (!columns.has('imagedata3')) {
      await connection.query(
        `ALTER TABLE tblPODetails
         ADD COLUMN ImageData3 LONGBLOB NULL AFTER ImageData2`
      );
      console.log('Added tblPODetails.ImageData3');
    }

    const [verified] = await connection.query(
      `SELECT COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'tblPODetails'
         AND COLUMN_NAME IN ('path_display', 'ImageUrl', 'ImageData', 'ImageData2', 'ImageData3')
       ORDER BY ORDINAL_POSITION`
    );
    for (const column of verified) {
      console.log(`Verified tblPODetails.${column.columnName} ${column.columnType}`);
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
