import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const load = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const strip = source => source.replace(/^import .*;\r?$/gm, '');
const buyingSource = await readFile('src/lib/buyingTax.js', 'utf8');
const taxSource = buyingSource + '\n' + (await readFile('src/lib/invoiceTax.js', 'utf8')).replace(/^import .*;\r?$/gm, '');
const formatSource = await readFile('src/lib/format.js', 'utf8');
const tax = await load(taxSource);
const invoices = await load(`${formatSource}\n${taxSource}\n${strip(await readFile('src/lib/invoices.js', 'utf8'))}`);
const einvoice = await load(`${taxSource}\n${strip(await readFile('src/lib/eInvoice.js', 'utf8'))}\nexport { buildDocument };`);
const workbookSource = strip(await readFile('src/lib/excelInvoice.js', 'utf8'))
  .replace("import('exceljs')", `import('${pathToFileURL(require.resolve('exceljs')).href}')`);
const excel = await load(`${formatSource}\n${taxSource}\nconst invoiceQrBuffer = async () => null;\n${workbookSource}`);
const ewaybill = await load(`class WhitebooksError extends Error {}\n${strip(await readFile('src/lib/whitebooksEwayBill.js', 'utf8'))}`);
const lines = [
  { VendorArticleName: 'T_SH_LOW', Qty: 2, Rate: 1250, Amount: 2500, HSNCode: '42021250', Size: 'NOS' },
  { VendorArticleName: 'T_TR_OTHER', Qty: 3, Rate: 1000, Amount: 3000, HSNCode: '42021250', Size: 'NOS' },
];
for (const split of [0, 1]) {
  const base = { InvoiceNo: 'TEST/FREIGHT', BillFromName: 'TEAKWOOD', ConsigneeName: 'Test buyer', InvoiceDate: '2026-10-23', InterStateTax: split, IGSTRate: split ? 0 : 18, CGST: split ? 9 : 0, SGST: split ? 9 : 0 };
  assert.deepEqual(invoices.calculateInvoiceTotals(base, lines), invoices.calculateInvoiceTotals({ ...base, TransportationCharges: 0 }, lines));
  const header = { ...base, TransportationCharges: 100 };
  const totals = invoices.calculateInvoiceTotals(header, lines);
  assert.equal(totals.totalQty, 5, 'freight must not increase goods quantity');
  assert.equal(totals.taxableAmount, 5600);
  assert.equal(totals.transportationCharges, 100);
  assert.equal(totals.grandTotal, 6283);
  assert.equal(totals.igstAmount, split ? 0 : 683);
  assert.equal(totals.cgstAmount, split ? 341.5 : 0);
  assert.equal(totals.sgstAmount, split ? 341.5 : 0);
  assert.equal(totals.taxSummary[0].taxableAmount, 2500);
  assert.equal(totals.taxSummary[1].taxableAmount, 3100);
  const draft = einvoice.createEInvoiceDraft({ header, lines });
  draft.seller.Stcd = '06'; draft.buyer.Pos = split ? '06' : '07';
  const document = einvoice.buildDocument({ header, lines }, draft);
  assert.equal(document.ItemList.length, 3);
  assert.equal(document.ItemList[2].IsServc, 'Y');
  assert.equal(document.ItemList[2].HsnCd, '9965');
  assert.equal(document.ItemList[2].GstRt, 18, 'freight follows header rate, not 5% item rate');
  assert.equal(document.ValDtls.AssVal, totals.taxableAmount);
  assert.equal(document.ValDtls.TotInvVal, totals.grandTotal);
  assert.equal(document.ValDtls.IgstVal, totals.igstAmount);
  assert.equal(document.ValDtls.CgstVal, totals.cgstAmount);
  const bill = ewaybill.buildStandaloneEwayBill(document, { Distance: 0, TransMode: '1', VehType: 'R', VehNo: 'HR55AK1977' });
  assert.equal(bill.itemList.length, 2, 'movement contains goods only');
  assert.equal(bill.totalValue, 5500);
  assert.equal(bill.otherValue, 118);
  assert.equal(bill.totalValue + bill.igstValue + bill.cgstValue + bill.sgstValue + bill.otherValue, bill.totInvValue);
  const workbook = await excel.buildInvoiceWorkbook({ header, lines, totals });
  const sheet = workbook.getWorksheet('Invoice');
  const labels = new Map();
  sheet.eachRow(row => row.eachCell(cell => { if (typeof cell.value === 'string') labels.set(cell.value, cell); }));
  const freight = labels.get('TRANSPORTATION CHARGES'), taxable = labels.get('TAXABLE AMOUNT');
  assert.ok(freight);
  assert.equal(freight.row + 1, taxable.row);
  assert.deepEqual(freight.font, taxable.font);
  assert.deepEqual(freight.border, taxable.border);
  assert.equal(sheet.getCell(`L${freight.row}`).numFmt, '#,##0.00');
  assert.equal(sheet.getCell(`L${freight.row}`).value.result, 100);
  assert.match(sheet.getCell(`L${taxable.row}`).formula, new RegExp(`\\+L${freight.row}$`));
  const taxLabel = labels.get(split ? 'CGST' : 'IGST');
  assert.match(sheet.getCell(`L${taxLabel.row}`).formula, new RegExp(`ROUND\\(L${freight.row}\\*`));
  assert.equal(sheet.getCell(`L${labels.get('GRAND TOTAL').row}`).value.result, 6283);
  if (process.env.INVOICE_PREVIEW_DIR && !split) {
    await mkdir(process.env.INVOICE_PREVIEW_DIR, { recursive: true });
    await workbook.xlsx.writeFile(`${process.env.INVOICE_PREVIEW_DIR}/transportation-invoice.xlsx`);
    await writeFile(`${process.env.INVOICE_PREVIEW_DIR}/invoice.json`, JSON.stringify({ header, lines, totals }));
  }
}
// Small charges must not reuse a nearby stale header total in IRN JSON.
const tinyHeader = { TransportationCharges: 0.5, GrandTotal: 1180, IGSTRate: 18 };
const tinyLines = [{ VendorArticleName: 'BAG', Qty: 1, Rate: 1000, Amount: 1000, HSNCode: '42021250' }];
const tinyDraft = einvoice.createEInvoiceDraft({ header: tinyHeader, lines: tinyLines });
tinyDraft.seller.Stcd = '06'; tinyDraft.buyer.Pos = '07';
assert.equal(einvoice.buildDocument({ header: tinyHeader, lines: tinyLines }, tinyDraft).ValDtls.TotInvVal, 1181);
assert.equal(invoices.calculateInvoiceTotals(tinyHeader, tinyLines).grandTotal, 1181);

// Save/reload defaults, validation and post-IRN edits use mocked database functions only.
let savedHeader = { InvoiceNo: 'TEST/FREIGHT', IRN: '', TransportationCharges: 0 };
let writes = [];
globalThis.__freightRun = async (sql, args) => {
  if (sql.startsWith('SELECT InvoiceNo, IRN, TransportationCharges')) return [{ ...savedHeader }];
  if (sql.startsWith('SELECT InvoiceID')) return [];
  writes.push({ sql, args });
  return { insertId: 99, affectedRows: 1 };
};
const customer = await load(`
  const ensureBuyingTaxColumns = async () => {};
  const ensureInvoiceTaxVersionColumn = async () => {};
  const ensureInvoicePresentationColumns = async () => {};
  const ensureInvoiceTransportationColumn = async () => {};
  const withTransaction = async work => work(globalThis.__freightRun);
  ${strip(await readFile('src/lib/customerInvoice.js', 'utf8'))}
`);
for (const invalid of [-1, '1.234', 'NaN', 'Infinity', '1e3', '9999999999999999']) {
  await assert.rejects(customer.saveCustomerInvoice({ InvoiceID: 1, InvoiceNo: 'TEST/FREIGHT', TransportationCharges: invalid }), /Transportation charges/);
}
await customer.saveCustomerInvoice({ InvoiceID: 1, InvoiceNo: 'TEST/FREIGHT', TransportationCharges: '123.45', TotalInWords: 'STALE WORDS' });
let update = writes.find(x => x.sql.startsWith('UPDATE'));
const updateFields = update.sql.slice(update.sql.indexOf(' SET ') + 5, update.sql.indexOf(' WHERE ')).split(', ').map(x => x.split(' = ')[0]);
assert.equal(update.args[updateFields.indexOf('TransportationCharges')], 123.45);
assert.equal(update.args[updateFields.indexOf('TotalInWords')], '');
savedHeader.TransportationCharges = 123.45; writes = [];
await customer.saveCustomerInvoice({ InvoiceID: 1, InvoiceNo: 'TEST/FREIGHT' });
update = writes.find(x => x.sql.startsWith('UPDATE'));
assert.equal(update.args[updateFields.indexOf('TransportationCharges')], 123.45, 'older clients must preserve stored freight when omitted');
savedHeader.IRN = 'a'.repeat(64); writes = [];
savedHeader.AckNo = '132629420149269'; savedHeader.AckDate = '2026-10-23 12:00:00';
for (const charge of [200, 50, 0]) {
  writes = [];
  const result = await customer.saveCustomerInvoice({ InvoiceID: 1, InvoiceNo: 'TEST/FREIGHT', TransportationCharges: charge, TotalInWords: 'STALE WORDS' });
  update = writes.find(x => x.sql.startsWith('UPDATE'));
  assert.equal(update.args[updateFields.indexOf('TransportationCharges')], charge);
  assert.equal(update.args[updateFields.indexOf('IRN')], savedHeader.IRN);
  assert.equal(update.args[updateFields.indexOf('AckNo')], savedHeader.AckNo);
  assert.equal(update.args[updateFields.indexOf('AckDate')], savedHeader.AckDate);
  assert.equal(update.args[updateFields.indexOf('TotalInWords')], '');
  assert.match(result.message, /updated locally/);
  assert.equal(writes.length, 1, 'only the invoice header may be updated; provider records stay intact');
}
writes = [];
await customer.saveCustomerInvoice({ InvoiceID: 1, InvoiceNo: 'TEST/FREIGHT', IRN: '', TransportationCharges: savedHeader.TransportationCharges });
update = writes.find(x => x.sql.startsWith('UPDATE'));
assert.equal(update.args[updateFields.indexOf('IRN')], savedHeader.IRN, 'registered/cancelled IRN history cannot be cleared through the editor');
savedHeader.IRN = ''; writes = [];
await customer.saveCustomerInvoice({ InvoiceID: 1, InvoiceNo: 'TEST/FREIGHT', TransportationCharges: 100 });
assert.ok(writes.some(x => x.sql.startsWith('UPDATE')), 'pending IRN submissions do not block local charge edits');
// Unrelated edits remain available on submitted invoices when the charge is unchanged.
await customer.saveCustomerInvoice({ InvoiceID: 1, InvoiceNo: 'TEST/FREIGHT', TransportationCharges: 123.45, InvoiceNote: 'Unrelated edit' });
assert.ok(writes.some(x => x.sql.startsWith('UPDATE')));
delete globalThis.__freightRun;
const wordsSource = await readFile('src/lib/numberWords.js', 'utf8');
const words = await load(wordsSource);
let readHeader = { TransportationCharges: 100, IGSTRate: 18, TotalInWords: 'STALE SAVED WORDS' };
globalThis.__freightRead = async sql => sql.includes('SELECT h.*') ? [{ ...readHeader }] : lines;
const reader = await load(`const resolveInvoiceTaxSnapshot = async (header,lines) => ({header,lines}); const query = globalThis.__freightRead;\n${formatSource}\n${taxSource}\n${wordsSource}\n${strip(await readFile('src/lib/invoices.js', 'utf8'))}`);
let reloaded = await reader.getInvoice('TEST/FREIGHT');
assert.equal(reloaded.header.TotalInWords, words.amountInWords(6283));
assert.equal(reloaded.totals.transportationCharges, 100);
readHeader = { IGSTRate: 18, TotalInWords: 'EXISTING MANUAL WORDS' };
reloaded = await reader.getInvoice('ZERO/FREIGHT');
assert.equal(reloaded.header.TotalInWords, 'EXISTING MANUAL WORDS', 'zero-charge legacy wording must be preserved');
delete globalThis.__freightRead;
console.log('Passed: freight taxes, totals, Excel formulas/style, e-invoice and e-way totals, validation and post-IRN charge edits with original references preserved. No live calls.');
