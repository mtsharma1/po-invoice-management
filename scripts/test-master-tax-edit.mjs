import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const strip = source => source.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\r?$/gm, '');
let statements = [];
globalThis.__masterTaxRun = async (sql, values) => {
 statements.push({sql,values});
 if(sql.startsWith('SELECT POBarcode,')) return [{POBarcode:'TEST',BuyingTaxCGST:0,BuyingTaxIGST:0,BuyingTaxSGST:0}];
 return {affectedRows:1};
};
const source = `${await readFile('src/lib/buyingTax.js','utf8')}
const ensurePOConsigneeNameColumn = async () => {};
const ensurePODetailImageColumns = async () => {};
const ensureBuyingTaxColumns = async () => {};
const withTransaction = work => work(globalThis.__masterTaxRun);
${strip(await readFile('src/lib/master.js','utf8'))}`;
const api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
for(const rates of [[9,0,9],[0,18,0]]) {
 statements=[];
 await api.saveMasterLine({POID:1,SKUCode:'SKU',Rate:1102,BuyingTaxCGST:rates[0],BuyingTaxIGST:rates[1],BuyingTaxSGST:rates[2]});
 const update=statements.find(s=>s.sql.startsWith('UPDATE tblPODetails'));
 for(const [i,field] of ['BuyingTaxCGST','BuyingTaxIGST','BuyingTaxSGST'].entries()) {
  const columns=[...update.sql.matchAll(/`([^`]+)` = \?/g)].map(match=>match[1]);
  assert.equal(update.values[columns.indexOf(field)], rates[i]);
  assert.equal(update.values[columns.indexOf(`${field}Amount`)], Math.round(1102*rates[i])/100);
 }
}
for(const rates of [[9,18,9],[9,0,0],[0,0,9],[-1,0,9],['bad',0,9]]) {
 statements=[];
 await assert.rejects(api.saveMasterLine({POID:1,BuyingTaxCGST:rates[0],BuyingTaxIGST:rates[1],BuyingTaxSGST:rates[2]}));
 assert.equal(statements.filter(s=>s.sql.startsWith('UPDATE')).length,0);
}
statements=[];
await api.saveMasterLine({POID:1,SKUCode:'CHANGED'});
assert.ok(!statements.find(s=>s.sql.startsWith('UPDATE tblPODetails')).sql.includes('`BuyingTax'));
delete globalThis.__masterTaxRun;
console.log('Passed Master tax editing, CGST/SGST and IGST combinations, invalid rates rejected before UPDATE, and omitted taxes preserved. Mocked database only.');
