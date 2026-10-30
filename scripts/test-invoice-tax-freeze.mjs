import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const urls=new Map();
const strip=source=>source.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\r?$/gm,'');
const snapshots=new Map(), submissions=new Map(), headers=new Map(), pos=new Map();
let writes=[];
const irn='a'.repeat(64);
const gstin='06BMTPS4959L1ZX';
function invoice(id,no,poid,po='PO/A') {
  headers.set(no,{InvoiceID:id,InvoiceNo:no,POBarcode:po,InvoiceDate:'2026-10-28',TaxDetailsVersion:2,
    GSTN:gstin,BillFromName:'TEAKWOOD',BillFromAddress:'Plot 56, Gurgaon, Haryana, 122001',
    ConsigneeName:'Buyer Company',ConsigneeAddress:`Plot 11, Gurgaon, Haryana, 122001 GSTIN: ${gstin}`,
    DeliveredToName:'Buyer Company',DeliveredToAddress:`Plot 11, Gurgaon, Haryana, 122001 GSTIN: ${gstin}`,
    IRN:'',TransportationCharges:100,poid});
  if(!pos.has(poid))pos.set(poid,{POID:poid,POBarcode:po,VendorArticleName:'BAG/'+poid,HSNCode:'42021250',SKUCode:'SKU/'+poid,
    Rate:1000,Qty:2,Amount:2000,BuyingTaxCGST:9,BuyingTaxSGST:9,BuyingTaxIGST:0});
}
invoice(1,'INV/A',10);invoice(2,'INV/B',10);invoice(3,'INV/OTHER',20,'PO/B');
pos.get(20).VendorArticleName=pos.get(10).VendorArticleName;
pos.get(20).SKUCode=pos.get(10).SKUCode;
globalThis.__freezeQuery=async(sql,args=[])=>{
 const normalized=sql.trim();
 if(normalized.startsWith('CREATE TABLE'))return [];
 if(sql.includes('SELECT h.*'))return headers.has(args[0])?[{...headers.get(args[0])}]:[];
 if(sql.includes('ROW_NUMBER() OVER'))return headers.has(args[0])?(headers.get(args[0]).poids||[headers.get(args[0]).poid]).map((id,index)=>({SlNo:index+1,...pos.get(id)})):[];
 if(sql.startsWith('SELECT IRN, SnapshotJson FROM webInvoiceTaxSnapshots'))return snapshots.has(args[0])?[{...snapshots.get(args[0])}]:[];
 if(sql.startsWith('SELECT IRN FROM webInvoiceTaxSnapshots'))return snapshots.has(args[0])?[{IRN:snapshots.get(args[0]).IRN}]:[];
 if(sql.includes('SELECT State, ResultJson FROM webWhitebooksProductionIrn')||sql.includes('SELECT InvoiceID, RequestJson, ResultJson FROM webWhitebooksProductionIrn')||sql.startsWith('SELECT InvoiceID FROM webWhitebooksProductionIrn'))return submissions.has(args[0])?[{...submissions.get(args[0])}]:[];
 if(sql.startsWith('SELECT IRN, AckNo'))return [{...headers.get(args[1])}];
 if(sql.startsWith('SELECT POBarcode,'))return [{...pos.get(args[0])}];
 if(sql.startsWith('SELECT InvoiceID'))return [];
 writes.push({sql,args});
 if(sql.includes('INSERT INTO webWhitebooksProductionIrn'))submissions.set(args[0],{InvoiceID:args[2],State:args[3],RequestJson:args[4]});
 else if(sql.includes('INSERT INTO webInvoiceTaxSnapshots')) {
   if(!snapshots.get(args[0])?.IRN)snapshots.set(args[0],{InvoiceNo:args[1],IRN:null,SnapshotJson:args[2]});
 } else if(sql.includes('INSERT IGNORE INTO webInvoiceTaxSnapshots')) {
   if(!snapshots.has(args[0]))snapshots.set(args[0],{InvoiceNo:args[1],IRN:args[2],SnapshotJson:args[3]});
 } else if(sql.startsWith('UPDATE webInvoiceTaxSnapshots'))snapshots.get(args[1]).IRN=args[0];
 else if(sql.startsWith('UPDATE webWhitebooksProductionIrn SET State = ?, ResultJson'))Object.assign(submissions.get(args[2]),{State:args[0],ResultJson:args[1]});
 else if(sql.startsWith('UPDATE webWhitebooksProductionIrn SET State'))submissions.get(args[1]).State=args[0];
 else if(sql.startsWith('UPDATE tblInvoiceHeader SET IRN'))Object.assign(headers.get(args[4]),{IRN:args[0],AckNo:args[1],AckDate:args[2]});
 else if(sql.startsWith('UPDATE tblPODetails SET')) {
   const columns=[...sql.matchAll(/`([^`]+)` = \?/g)].map(match=>match[1]);
   const row=pos.get(args.at(-1));columns.forEach((field,i)=>row[field]=args[i]);
 } else if(sql.includes('UPDATE tblInvoiceHeader h JOIN tblDispatch')) {
   assert.match(sql,/d\.POID = \? AND d\.POBarcode = \? AND h\.POBarcode = \?/);
   for(const header of headers.values())if((header.poids||[header.poid]).includes(args[0])&&header.POBarcode===args[1]&&header.POBarcode===args[2]&&!header.IRN){header.TaxDetailsVersion=2;header.TotalInWords='';}
 } else if(sql.startsWith('UPDATE tblPOHeaders')){}
 else throw new Error('Unexpected test query: '+sql);
 return {affectedRows:1,insertId:1};
};
urls.set('db',url('export const query=(...args)=>globalThis.__freezeQuery(...args);export const withTransaction=work=>work(query);'));
urls.set('whitebooks',url(`export class WhitebooksError extends Error{};export const getEInvoiceConfig=()=>({values:{gstin:'${gstin}'}});export const authenticateWhitebooks=async()=>({authToken:'mock'});export const generateWhitebooksIrn=async()=>({Irn:'${irn}',AckNo:'123456',AckDt:'2026-10-28 12:00:00'});`));
urls.set('ewayBillTransport',url('export const getEwayBillTransport=async()=>null;'));
async function module(name) {
 if(urls.has(name))return urls.get(name);
 let source=await readFile(`src/lib/${name}.js`,'utf8');
 const matches=[...source.matchAll(/from ['"]\.\/([^'"]+)['"]/g)];
 for(const match of matches)source=source.replace(match[0],`from '${await module(match[1].replace(/\.js$/,''))}'`);
 urls.set(name,url(source));return urls.get(name);
}
const api=await import(await module('invoices'));
const einvoice=await import(await module('eInvoice'));
const snapshot=await import(await module('invoiceTaxSnapshot'));
const production=await import(await module('whitebooksProductionIrn'));
const master=await import(url(`import {query,withTransaction} from '${urls.get('db')}';import {buyingTaxRates} from '${await module('buyingTax')}';
 const ensurePOConsigneeNameColumn=async()=>{};const ensurePODetailImageColumns=async()=>{};const ensureBuyingTaxColumns=async()=>{};const ensureInvoiceTaxVersionColumn=async()=>{};
 ${strip(await readFile('src/lib/master.js','utf8'))}`));
const before=await api.getInvoice('INV/A');
assert.equal(before.totals.cgstAmount,189);
const draft=einvoice.createEInvoiceDraft(before);
const generated=await production.generateProductionIrn('INV/A',draft);
assert.equal(generated.ok,true,JSON.stringify(generated.validation?.errors));
assert.equal(snapshots.get(1).IRN,irn,'successful IRN must freeze the exact submission snapshot');
const snapshotBytes=snapshots.get(1).SnapshotJson;
await production.generateProductionIrn('INV/A',draft);
assert.equal(snapshots.get(1).SnapshotJson,snapshotBytes,'registration recovery must not replace frozen rates');
// An unregistered legacy invoice for the same PO is upgraded only when that PO tax changes.
headers.get('INV/B').TaxDetailsVersion=1;
headers.get('INV/OTHER').TaxDetailsVersion=1;
await master.saveMasterLine({...pos.get(10),BuyingTaxCGST:2.5,BuyingTaxSGST:2.5,BuyingTaxIGST:0});
const registered=await api.getInvoice('INV/A');
const unregistered=await api.getInvoice('INV/B');
const other=await api.getInvoice('INV/OTHER');
assert.equal(registered.totals.cgstAmount,189);
assert.equal(registered.lines[0].TaxRate,18);
assert.equal(unregistered.totals.cgstAmount,52.5);
assert.equal(unregistered.lines[0].TaxRate,5);
assert.equal(headers.get('INV/OTHER').TaxDetailsVersion,1);
assert.equal(pos.get(20).BuyingTaxCGST,9);
assert.equal(snapshots.get(1).SnapshotJson,snapshotBytes);
// A cancelled IRN stays frozen, including if the header IRN is later cleared externally.
submissions.get('INV/A').State='cancelled';headers.get('INV/A').IRN='';
await assert.rejects(production.generateProductionIrn('INV/A',draft),/cancelled IRN/);
assert.equal((await api.getInvoice('INV/A')).totals.cgstAmount,189);
assert.equal((await api.getInvoice('INV/A')).header.IRN,irn);
// E-invoice output and Excel export must use the same frozen item and freight rates.
const frozen=await api.getInvoice('INV/A');
const prepared=await einvoice.prepareEInvoice('INV/A',einvoice.createEInvoiceDraft(frozen));
assert.equal(prepared.document.ValDtls.CgstVal,189);
assert.deepEqual(prepared.document.ItemList.map(item=>item.GstRt),[18,18]);
const excelSource=strip(await readFile('src/lib/excelInvoice.js','utf8')).replace("import('exceljs')",`import('${pathToFileURL(require.resolve('exceljs')).href}')`);
const excel=await import(url(`import {lineTaxRates,usesItemTaxDetails} from '${await module('invoiceTax')}';import {usesBuyingTax} from '${await module('buyingTax')}';import {dateText,dateTimeText,text} from '${await module('format')}';const invoiceQrBuffer=async()=>null;${excelSource}`));
const workbook=await excel.buildInvoiceWorkbook(frozen);assert.equal(workbook.getWorksheet('Invoice').getCell('K19').value,18);
await workbook.xlsx.writeBuffer();
const viewCode=require('next/dist/build/swc').transformSync(await readFile('src/components/InvoiceView.js','utf8'),{
 jsc:{parser:{syntax:'ecmascript',jsx:true},target:'es2020',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}
}).code;
const format=await import(await module('format')), tax=await import(await module('invoiceTax'));
const view={exports:{}};
new Function('require','module','exports',viewCode)(name=>name==='@/lib/format'?format:name==='@/lib/invoiceTax'?tax:name==='@/lib/invoiceQr'?{invoiceQrUrl:()=>'/qr.png'}:require(name),view,view.exports);
const html=require('react-dom/server').renderToStaticMarkup(require('react').createElement(view.exports.default,{invoice:frozen}));
assert.ok(html.includes('<td>18%</td>'));
assert.ok(html.includes('189.00'),'printable invoice must show frozen taxes');
// Historical recovery uses the saved registered document after PO tax rates have changed.
invoice(4,'INV/OLD',10);const oldHeader=headers.get('INV/OLD');oldHeader.IRN='b'.repeat(64);oldHeader.TaxDetailsVersion=1;
const oldDoc=JSON.parse(submissions.get('INV/A').RequestJson);oldDoc.DocDtls.No='INV/OLD';
submissions.set('INV/OLD',{InvoiceID:4,State:'cancelled',RequestJson:JSON.stringify(oldDoc),ResultJson:JSON.stringify({Irn:oldHeader.IRN})});
assert.equal((await api.getInvoice('INV/OLD')).totals.cgstAmount,189);
assert.equal(snapshots.get(4).IRN,oldHeader.IRN);
// Mixed rates retain 5% freight after both PO items become 18%.
invoice(7,'INV/MIX',30);invoice(8,'INV/MIX/LIVE',30);
pos.get(30).BuyingTaxCGST=2.5;pos.get(30).BuyingTaxSGST=2.5;
pos.set(31,{...pos.get(30),POID:31,VendorArticleName:'BAG/31',BuyingTaxCGST:9,BuyingTaxSGST:9});
headers.get('INV/MIX').poids=[30,31];headers.get('INV/MIX/LIVE').poids=[30,31];
const mixed=await api.getInvoice('INV/MIX');
assert.equal(mixed.totals.cgstAmount,232.5);
assert.equal((await production.generateProductionIrn('INV/MIX',einvoice.createEInvoiceDraft(mixed))).ok,true);
await master.saveMasterLine({...pos.get(30),BuyingTaxCGST:9,BuyingTaxSGST:9});
assert.equal((await api.getInvoice('INV/MIX')).totals.cgstAmount,232.5);
assert.equal((await api.getInvoice('INV/MIX/LIVE')).totals.cgstAmount,369);
assert.equal((await api.getInvoice('INV/B')).lines[0].TaxRate,5,'another item of the same PO must not be updated');
const mixDocument=await einvoice.prepareEInvoice('INV/MIX',einvoice.createEInvoiceDraft(await api.getInvoice('INV/MIX')));
assert.deepEqual(mixDocument.document.ItemList.map(item=>item.GstRt),[5,18,5]);
// Prefer the actual signed registration document over the request for old invoices.
invoice(9,'INV/SIGNED',10);headers.get('INV/SIGNED').IRN='f'.repeat(64);
const signed=structuredClone(oldDoc);signed.DocDtls.No='INV/SIGNED';signed.Irn='f'.repeat(64);
const jwt='header.'+Buffer.from(JSON.stringify({data:JSON.stringify(signed)})).toString('base64url')+'.signature';
submissions.set('INV/SIGNED',{InvoiceID:9,State:'cancelled',RequestJson:'{}',ResultJson:JSON.stringify({Irn:'f'.repeat(64),Status:'CNL',SignedInvoice:jwt})});
assert.equal((await api.getInvoice('INV/SIGNED')).totals.cgstAmount,189);
// Missing/mismatched evidence must fail safely, never infer historical tax from the current PO.
invoice(5,'INV/MISSING',10);headers.get('INV/MISSING').IRN='c'.repeat(64);
await assert.rejects(api.getInvoice('INV/MISSING'),/no verified saved tax submission/);
invoice(6,'INV/MISMATCH',10);headers.get('INV/MISMATCH').IRN='d'.repeat(64);
submissions.set('INV/MISMATCH',{InvoiceID:6,RequestJson:JSON.stringify(oldDoc),ResultJson:JSON.stringify({Irn:'e'.repeat(64)})});
await assert.rejects(api.getInvoice('INV/MISMATCH'),/differs/);
const incompatible=structuredClone(oldDoc);incompatible.ItemList[0].Qty=99;
assert.throws(()=>snapshot.makeTaxSnapshot({header:oldHeader,lines:frozen.lines},incompatible),/cannot be matched/);
// IGST/split-tax switches affect unregistered invoices only, even with identical SKUs in other POs.
await master.saveMasterLine({...pos.get(10),BuyingTaxCGST:0,BuyingTaxSGST:0,BuyingTaxIGST:12});
assert.equal((await api.getInvoice('INV/B')).totals.igstAmount,252);
assert.equal((await api.getInvoice('INV/B')).totals.cgstAmount,0);
assert.equal((await api.getInvoice('INV/A')).totals.cgstAmount,189);
assert.equal((await api.getInvoice('INV/OLD')).totals.cgstAmount,189);
assert.equal(pos.get(20).BuyingTaxCGST,9);
// An uncertain request is still live until registration is confirmed, then freezes its original request.
invoice(10,'INV/PENDING',40);
const pending=await api.getInvoice('INV/PENDING');
const pendingDoc=(await einvoice.prepareEInvoice('INV/PENDING',einvoice.createEInvoiceDraft(pending))).document;
await snapshot.saveTaxCandidate(globalThis.__freezeQuery,pending,pendingDoc);
submissions.set('INV/PENDING',{InvoiceID:10,State:'uncertain',RequestJson:JSON.stringify(pendingDoc),ResultJson:null});
await master.saveMasterLine({...pos.get(40),BuyingTaxCGST:2.5,BuyingTaxSGST:2.5,BuyingTaxIGST:0});
assert.equal((await api.getInvoice('INV/PENDING')).totals.cgstAmount,52.5);
const save=await import(await module('productionIrnSave'));
await save.saveProductionIrnFields(globalThis.__freezeQuery,'INV/PENDING',{Irn:'1'.repeat(64),AckNo:'99999',AckDt:'2026-10-28 12:00:00'});
assert.equal((await api.getInvoice('INV/PENDING')).totals.cgstAmount,189);
delete globalThis.__freezeQuery;
console.log('Passed registration → snapshot → PO tax edit → frozen/cancelled invoice, live unregistered invoice, unrelated PO isolation, historical recovery, missing/mismatched evidence, Excel and e-invoice outputs. All database/provider operations mocked.');
