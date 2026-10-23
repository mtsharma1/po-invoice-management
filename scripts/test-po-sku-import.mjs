import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
let statements = [], duplicate = false;
globalThis.__skuImportRun = async (sql, args) => {
  statements.push({ sql, args });
  if (sql.startsWith('CREATE')) return [];
  if (sql.includes('SELECT POBarcode FROM tblPOHeaders')) return duplicate ? [{ POBarcode: 'SKU/TEST' }] : [];
  if (sql.includes('SELECT * FROM webTmpPOHeaders')) return [{ POBarcode: 'SKU/TEST' }];
  if (sql.includes('SELECT COUNT(*) AS rowCount')) return [{ rowCount: 4 }];
  if (sql.trimStart().startsWith('SELECT')) return [];
  return { affectedRows: 4 };
};
const source = (await readFile('src/lib/importPO.js', 'utf8'))
  .replace(/^import .*;\r?$/gm, '')
  .replace("import('exceljs')", `import('${pathToFileURL(require.resolve('exceljs')).href}')`);
const api = await import('data:text/javascript;base64,' + Buffer.from(`
const query = globalThis.__skuImportRun;
const withTransaction = async work => work(query);
const ensurePOConsigneeNameColumn = async () => {};
const ensurePOImportDateColumn = async () => {};
${source}
export { parsePurchaseOrderWorkbook, detailColumns };
`).toString('base64'));
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Purchase Order');
sheet.getCell('A2').value = 'PO Barcode'; sheet.getCell('B2').value = 'SKU/TEST';
const headings = ['SKU Id', 'Style Id', 'SKU Code', 'HSN Code', 'Brand', 'GTIN', 'Vendor Article Number', 'Vendor Article Name', 'Size', 'Colour', 'MRP', 'Quantity', 'List price(FOB+Transport-Excise)', 'Landing Price', 'Estimated Delivery Date', 'Selling Tax CGST', 'Selling Tax IGST', 'Selling Tax IGST Amount', 'Selling Tax SGST', 'Selling Tax SGST Amount', 'Category'];
sheet.getRow(9).values = headings;
const codes = ['TWLTBELT84397182', '000123', { formula: '"FORMULA-SKU"', result: 'FORMULA-SKU' }, ''];
codes.forEach((code, index) => {
  sheet.getRow(10 + index).values = ['IGNORED-ID', '26105114', code, '42033000', 'Teakwood', '84397182123456', 'IGNORED-ARTICLE-NO', 'T_BT_CR_1_BL_34', '36', 'Black', 1799, 10, 100, 118, new Date('2026-11-30'), 0, 18, 180, 0, 0, 'Gurgaon SLG'];
});
const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
const parsed = await api.parsePurchaseOrderWorkbook(buffer);
assert.deepEqual(parsed.details.map(row => row.SKUCode), ['TWLTBELT84397182', '000123', 'FORMULA-SKU', '']);
assert.ok(parsed.details.every(row => row.SKUId === null && row.VendorArticleNumber === null), 'other excluded columns must remain excluded');

function assertInserted(table) {
  const insert = statements.find(row => row.sql.startsWith(`INSERT INTO ${table} (`) && row.sql.includes('VALUES ?'));
  assert.ok(insert, `missing ${table} detail insert`);
  const columns = insert.sql.slice(insert.sql.indexOf('(') + 1, insert.sql.indexOf(')')).split(', ');
  assert.deepEqual(insert.args[0].map(row => row[columns.indexOf('SKUCode')]), ['TWLTBELT84397182', '000123', 'FORMULA-SKU', '']);
}
await api.stagePurchaseOrderWorkbook('mock-session', buffer);
assertInserted('webTmpPODetails');
statements = [];
await api.saveStagedPurchaseOrder('mock-session');
const transfer = statements.find(row => row.sql.includes('INSERT INTO tblPODetails'));
assert.match(transfer.sql.split('SELECT ')[1], /StyleId, SKUCode, HSNCode,/);
statements = [];
await api.importPurchaseOrderWorkbook(buffer);
assertInserted('tblPODetails');
duplicate = true; statements = [];
await assert.rejects(api.importPurchaseOrderWorkbook(buffer), /already been imported/);
assert.equal(statements.filter(row => row.sql.startsWith('INSERT')).length, 0, 'duplicate PO protection remains in place');
delete globalThis.__skuImportRun;
console.log('Passed: optional SKU codes, leading zeros, formula values, preview staging, staged save, direct import, excluded fields and duplicate-PO protection. No live database calls.');
