import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const load = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const strip = source => source.replace(/^import .*;\r?$/gm,'');
const bytes = await readFile('public/templates/PO Upload Template.xlsx');
const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes);
const sheet = wb.getWorksheet('Purchase Order');
const headers = sheet.getRow(9).values;
const col = name => headers.indexOf(name);
for (const name of ['Buying Tax CGST','Buying Tax CGST Amount','Buying Tax SGST','Buying Tax SGST Amount']) assert.ok(col(name) > 0);
assert.deepEqual(headers.slice(23,29),['Buying Tax CGST','Buying Tax CGST Amount','Buying Tax SGST','Buying Tax SGST Amount','Buying Tax IGST','Buying Tax IGST Amount']);
assert.equal(sheet.getCell('AK10').dataValidation.type,'list');
assert.equal(sheet.getCell('AG10').dataValidation?.type,undefined,'old category cell must not retain its dropdown');
assert.equal(sheet.getCell('F10').value,'00042451111120','identifier leading zeros must survive');
assert.equal(sheet.model.merges.length,13,'template header merges preserved');
let statements=[], staged=[];
globalThis.__templateRun = async (sql,args=[]) => {
  statements.push({sql,args});
  if(sql.startsWith('INSERT INTO webTmpPODetails')) {
    const names = sql.slice(sql.indexOf('(')+1,sql.indexOf(')')).split(', ');
    staged=args[0].map(values=>Object.fromEntries(names.map((name,i)=>[name,values[i]])));
  }
  if(sql.includes('SELECT * FROM webTmpPOHeaders')) return [{POBarcode:'TEMPLATE/TEST'}];
  if(sql.includes('SELECT COUNT(*) AS rowCount')) return [{rowCount:staged.length}];
  if(sql.includes('SELECT BuyingTaxCGST, BuyingTaxIGST, BuyingTaxSGST FROM webTmpPODetails')) return staged;
  if(sql.trimStart().startsWith('SELECT')||sql.startsWith('CREATE'))return [];
  return {affectedRows:1,insertId:1};
};
const importer = await load(`
 const query = globalThis.__templateRun;
 const withTransaction = work=>work(query);
 const ensurePOConsigneeNameColumn=async()=>{};
 const ensurePOImportDateColumn=async()=>{};
 const ensureBuyingTaxColumns=async()=>{};
 ${await readFile('src/lib/buyingTax.js','utf8')}
 ${strip(await readFile('src/lib/importPO.js','utf8')).replace("import('exceljs')",`import('${pathToFileURL(require.resolve('exceljs')).href}')`)}
 export {parsePurchaseOrderWorkbook};
`);
// The actual downloadable sample must pass the application's importer without edits.
const sample = await importer.parsePurchaseOrderWorkbook(bytes);
assert.equal(sample.details[0].BuyingTaxIGST,18);
assert.equal(sample.details[0].BuyingTaxIGSTAmount,198.36);
assert.equal(sample.details[0].BuyingTaxCGSTAmount,0);
// Verify staged and direct import retain the four fields, including formula caches.
sheet.getCell('B2').value='TEMPLATE/TEST';
sheet.getCell(10,col('Buying Tax IGST')).value=0;
sheet.getCell(10,col('Buying Tax IGST Amount')).value=0;
sheet.getCell(10,col('Buying Tax CGST')).value=9;
sheet.getCell(10,col('Buying Tax SGST')).value=9;
for(const tax of ['CGST','SGST']) sheet.getCell(10,col(`Buying Tax ${tax} Amount`)).value={formula:`ROUND(R10*${tax==='CGST'?'W':'Y'}10/100,2)`,result:99.18};
const splitBytes=Buffer.from(await wb.xlsx.writeBuffer());
await importer.stagePurchaseOrderWorkbook('mock',splitBytes);
for(const field of ['BuyingTaxCGSTAmount','BuyingTaxSGSTAmount']) assert.equal(staged[0][field],99.18);
assert.equal(staged[0].BuyingTaxCGST,9);
await importer.saveStagedPurchaseOrder('mock');
const transfer=statements.find(row=>row.sql.startsWith('INSERT INTO tblPODetails')&&row.sql.includes('SELECT'));
for(const field of ['BuyingTaxCGST','BuyingTaxCGSTAmount','BuyingTaxSGST','BuyingTaxSGSTAmount']) assert.ok(transfer.sql.includes(field));
statements=[];await importer.importPurchaseOrderWorkbook(splitBytes);
const direct=statements.find(row=>row.sql.startsWith('INSERT INTO tblPODetails')&&row.sql.includes('VALUES ?'));
const names=direct.sql.slice(direct.sql.indexOf('(')+1,direct.sql.indexOf(')')).split(', ');
assert.equal(direct.args[0][0][names.indexOf('BuyingTaxSGSTAmount')],99.18);
const calculations=await load(`${await readFile('src/lib/buyingTax.js','utf8')}
 ${strip(await readFile('src/lib/invoiceTax.js','utf8'))}
 ${await readFile('src/lib/format.js','utf8')}
 ${strip(await readFile('src/lib/invoices.js','utf8'))}`);
const partialTotals=calculations.calculateInvoiceTotals({TaxDetailsVersion:2}, [{Qty:2,Rate:1102,Amount:2204,BuyingTaxCGST:9,BuyingTaxSGST:9,BuyingTaxIGST:0,BuyingTaxCGSTAmount:9999,BuyingTaxSGSTAmount:9999}]);
assert.equal(partialTotals.cgstAmount,198.36,'partial invoice tax uses dispatched amount, not supplied PO amount');
assert.equal(partialTotals.sgstAmount,198.36);
// Dispatch posting must validate imported rates and create a version-2 invoice.
let dispatchStatements=[];
let dispatchTax={POID:1,BuyingTaxCGST:9,BuyingTaxIGST:0,BuyingTaxSGST:9};
globalThis.__templateDispatchRun=async(sql,args)=>{
 dispatchStatements.push({sql,args});
 if(sql.includes('SELECT InvoiceID'))return [];
 if(sql.includes('SELECT BillTo, ShipTo'))return [{BillTo:'Bill address',ShipTo:'Ship address',ConsigneeName:'Buyer'}];
 if(sql.includes('AS Requested'))return [{POID:1,Requested:2,Available:5,MinimumQty:2}];
 if(sql.includes('pd.BuyingTaxCGST'))return [dispatchTax];
 if(sql.includes('SELECT WTDID'))return [{WTDID:1}];
 if(sql.trimStart().startsWith('SELECT'))return [];
 return {affectedRows:1,insertId:1};
};
const dispatch=await load(`
 const query=(...args)=>globalThis.__templateDispatchRun(...args);
 const withTransaction=work=>work(query);
 const ensurePOConsigneeNameColumn=async()=>{};
 const ensureInvoiceTaxVersionColumn=async()=>{};
 const ensureBuyingTaxColumns=async()=>{};
 const getWebSettings=async()=>({});
 ${await readFile('src/lib/buyingTax.js','utf8')}
 ${await readFile('src/lib/dispatchQuantity.js','utf8')}
 ${strip(await readFile('src/lib/dispatch.js','utf8'))}
`);
await dispatch.postDispatch({sessionId:'mock',poBarcode:'TEMPLATE/TEST',invoiceNo:'TEMPLATE/INV'});
assert.ok(dispatchStatements.some(row=>row.sql.includes('INSERT INTO tblInvoiceHeader')&&row.sql.includes(', 2)')));
assert.ok(dispatchStatements.some(row=>row.sql.includes('INSERT INTO tblDispatch')));
dispatchStatements=[];dispatchTax={POID:1,BuyingTaxCGST:0,BuyingTaxIGST:0,BuyingTaxSGST:0};
await assert.rejects(dispatch.postDispatch({sessionId:'mock',poBarcode:'TEMPLATE/TEST',invoiceNo:'BAD/INV'}),/Buying Tax/);
assert.ok(!dispatchStatements.some(row=>row.sql.startsWith('INSERT INTO tblInvoiceHeader')));
for(const bad of [-1,'invalid']) {
  sheet.getCell(10,col('Buying Tax CGST Amount')).value=bad;
  statements=[];
  await assert.rejects(importer.stagePurchaseOrderWorkbook('mock',Buffer.from(await wb.xlsx.writeBuffer())));
  assert.equal(statements.length,0,'invalid tax amounts must fail before database writes');
}
// Existing template-store hashes are replaced with the new bundled bytes on download.
let record=null;
globalThis.__templateStoreRun=async(sql,args)=>{
 if(sql.includes('SELECT TemplateKey, FileHash'))return [{FileHash:'old-template-hash'}];
 if(sql.startsWith('INSERT INTO webFileTemplates'))record={FileName:args[1],MimeType:args[2],FileData:args[3],FileSize:args[4],FileHash:args[5]};
 if(sql.includes('SELECT FileName, MimeType'))return [record];
 return [];
};
const templates=await load(`import {createHash} from 'node:crypto';import {readFile} from 'node:fs/promises';import path from 'node:path';const query=(...args)=>globalThis.__templateStoreRun(...args);${strip(await readFile('src/lib/fileTemplates.js','utf8'))}`);
const download=await templates.getPOTemplateFromDatabase();
assert.deepEqual(download.fileData,bytes);
assert.equal(download.fileHash,createHash('sha256').update(bytes).digest('hex'));
delete globalThis.__templateRun;delete globalThis.__templateStoreRun;
delete globalThis.__templateDispatchRun;
console.log('Passed actual template import, CGST/SGST rate and amount storage, formula caches, staged/direct save, invalid amounts, preserved dropdowns/IDs and template-download refresh. Mock database only.');
