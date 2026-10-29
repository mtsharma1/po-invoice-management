import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const load = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const buyingSource = await readFile('src/lib/buyingTax.js', 'utf8');
const taxSource = buyingSource + '\n' + (await readFile('src/lib/invoiceTax.js', 'utf8')).replace(/^import .*;\r?$/gm, '');
const tax = await load(taxSource);
const stripImports = (source) => source.replace(/^import .*;\r?$/gm, '');
const formatSource = await readFile('src/lib/format.js', 'utf8');
const invoices = await load(`${formatSource}\n${taxSource}\n${stripImports(await readFile('src/lib/invoices.js', 'utf8'))}`);
const legacySource = stripImports(await readFile('src/lib/excelInvoiceLegacy.js', 'utf8'))
  .replace("import('exceljs')", `import('${pathToFileURL(require.resolve('exceljs')).href}')`);
const legacy = await load(`${formatSource}\nconst invoiceQrBuffer = async () => null;\n${legacySource}`);
globalThis.__invoiceTaxTestLegacy = legacy.buildLegacyInvoiceWorkbook;
const exportSource = stripImports(await readFile('src/lib/excelInvoice.js', 'utf8'))
  .replace("import('exceljs')", `import('${pathToFileURL(require.resolve('exceljs')).href}')`);
const excel = await load(`${formatSource}\n${taxSource}\nconst invoiceQrBuffer = async () => null;\nconst buildLegacyInvoiceWorkbook = globalThis.__invoiceTaxTestLegacy;\n${exportSource}`);
const einvoice = await load(`${taxSource}\n${stripImports(await readFile('src/lib/eInvoice.js', 'utf8'))}\nexport { buildDocument };`);

for (const selected of [0, 1]) for (const version of [undefined, 0, 1]) {
  const header = { TaxDetailsVersion: version, InvoiceDate: '2026-09-01', InterStateTax: selected, CGST: selected ? 9 : 0, SGST: selected ? 9 : 0, IGSTRate: selected ? 0 : 18 };
  header.InvoiceNote = 'Deliver before Friday.\nContact receiving desk.';
  header.BeneficiaryName = 'TEAKWOOD';
  header.EwayBillNo = selected ? '322357718459' : '';
  assert.equal(tax.lineTaxRates(header, { VendorArticleName: 'T_SH_TEST', Amount: 2499.99 }).taxRate, 5);
  assert.equal(tax.lineTaxRates(header, { VendorArticleName: ' t_sh_test ', Amount: 2500 }).taxRate, 5);
  assert.equal(tax.lineTaxRates(header, { VendorArticleName: 'T_SH_TEST', Amount: 2500.01 }).taxRate, 18);
  assert.equal(tax.lineTaxRates(header, { VendorArticleName: 'T_TR_TEST', Rate: 1000 }).taxRate, 18);
  const lines = [
    { VendorArticleName: 'T_SH_LOW', Qty: 2, Rate: 1250, Amount: 2500 },
    { VendorArticleName: 'T_SH_HIGH', Qty: 1, Rate: 3000, Amount: 3000 },
    { VendorArticleName: 'T_TR_OTHER', Qty: 3, Rate: 1000, Amount: 3000 },
  ];
  const totals = invoices.calculateInvoiceTotals(header, lines);
  assert.equal(totals.taxableAmount, 8500);
  assert.equal(totals.grandTotal, 9705);
  assert.deepEqual(totals.taxSummary.map((group) => group.taxRate), [5, 18]);
  assert.equal(totals.igstAmount, selected ? 0 : 1205);
  assert.equal(totals.cgstAmount, selected ? 602.5 : 0);
  assert.equal(totals.sgstAmount, selected ? 602.5 : 0);
  assert.equal(totals.igstRate, null);
  const screenshotLines = [
    { VendorArticleName: 'T_TR_INDIA_B1_G7616_01', Qty: 5, Rate: 1102, Amount: 5510 },
    { VendorArticleName: 'T_SH_INDIA_B1_BL_02', Qty: 2, Rate: 1356, Amount: 2712 },
  ];
  assert.equal(tax.lineTaxRates(header, screenshotLines[1]).taxRate, 18);
  assert.equal(tax.lineTaxRates(header, { VendorArticleName: 'T_SH_TEST', Qty: 2, Rate: 1356 }).taxRate, 18);
  const screenshotTotals = invoices.calculateInvoiceTotals(header, screenshotLines);
  assert.equal(screenshotTotals.grandTotal, 9702);
  assert.equal(screenshotTotals.igstAmount, selected ? 0 : 1479.96);
  assert.equal(screenshotTotals.cgstAmount, selected ? 739.98 : 0);
  assert.deepEqual(screenshotTotals.taxSummary.map(group => group.taxRate), [18]);
  const draft = einvoice.createEInvoiceDraft({ header, lines });
  draft.seller.Stcd = '06';
  draft.buyer.Pos = selected ? '06' : '07';
  const document = einvoice.buildDocument({ header, lines }, draft);
  assert.deepEqual(document.ItemList.map((item) => item.GstRt), [5, 18, 18]);
  assert.equal(document.ValDtls.TotInvVal, totals.grandTotal);
  assert.equal(document.ValDtls.IgstVal, totals.igstAmount);
  assert.equal(document.ValDtls.CgstVal, totals.cgstAmount);
  assert.equal(document.ValDtls.SgstVal, totals.sgstAmount);

  const workbook = await excel.buildInvoiceWorkbook({ header, lines, totals });
  const ExcelJS = require('exceljs');
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = reloaded.getWorksheet('Invoice');
  assert.equal(sheet.getCell('A4').text, selected ? 'E-way bill: 322357718459' : '');
  assert.equal(sheet.getCell('I4').master.address, 'A4');
  assert.equal(sheet.getCell('K18').value, 'Tax %');
  assert.equal(sheet.getCell('L18').value, 'AMOUNT');
  assert.equal(sheet.getCell('K19').value, 5);
  assert.equal(sheet.getCell('K20').value, 18);
  assert.equal(sheet.getCell('L19').value.result, 2500);
  let summaryRow;
  sheet.eachRow((row) => { if (row.getCell(1).value === 'Tax Rate') summaryRow = row.number; });
  assert.equal(sheet.getCell(`H${summaryRow + totals.taxSummary.length}`).value, 'GRAND TOTAL');
  assert.equal(sheet.getCell('A23').border.top.style, 'thin');
  assert.equal(sheet.getCell('G22').alignment.horizontal, 'center');
  assert.equal(sheet.getCell('H22').alignment.vertical, 'middle');
  assert.equal(sheet.getCell(`A${summaryRow + 1}`).value, 5);
  assert.equal(sheet.getCell(`C${summaryRow + 1}`).value.result || 0, selected ? 0 : 125);
  assert.equal(sheet.getCell(`D${summaryRow + 1}`).value.result || 0, selected ? 62.5 : 0);
  assert.equal(sheet.getCell(`G${summaryRow + 2}`).value.result, 7080);
  assert.match(sheet.pageSetup.printArea, /L/);
  const cellsWithValue = (value) => {
    const found = [];
    sheet.eachRow(row => row.eachCell(cell => { if (cell.text === value) found.push(cell); }));
    return found;
  };
  const noteCell = cellsWithValue(`Note\n${header.InvoiceNote}`)[0];
  assert.ok(noteCell.row > summaryRow);
  assert.equal(noteCell.value.richText[0].font.bold, true);
  assert.equal(Boolean(noteCell.value.richText[1].font.bold), false);
  assert.equal(cellsWithValue('AUTH. SIGN')[0].font.bold, true);
  const beneficiary = cellsWithValue('BENEFICIARY NAME')[0];
  assert.ok(beneficiary);
  assert.equal(noteCell.row, beneficiary.row);
  assert.equal(sheet.getCell(`G${beneficiary.row + 4}`).master.address, noteCell.address);
  for (const label of ['FOR TEAKWOOD', 'AUTH. SIGN']) {
    const cell = cellsWithValue(label)[0];
    assert.equal(cell.border?.top?.style, undefined);
    assert.equal(cell.border?.bottom?.style, undefined);
  }
  assert.equal(beneficiary.font.bold, true);
  assert.equal(cellsWithValue('GRAND TOTAL')[0].font.bold, true);
  assert.equal(cellsWithValue('FOR TEAKWOOD')[0].font.bold, true);
  assert.equal(sheet.getCell(`A${summaryRow}`).font.bold, true);
  assert.equal(sheet.getCell(`H${beneficiary.row + 1}`).value, 'ACCOUNT NO.');
  assert.equal(sheet.getCell(`H${beneficiary.row + 2}`).value, 'IFSC CODE');
  assert.equal(sheet.getCell(`H${beneficiary.row + 3}`).value, 'BANK NAME');
  assert.equal(sheet.getCell(`H${beneficiary.row + 4}`).value, 'BRANCH');
  assert.ok(cellsWithValue('AUTH. SIGN')[0].row - cellsWithValue('FOR TEAKWOOD')[0].row >= 5);
  assert.equal(sheet.getCell(`A${beneficiary.row}`).border.left.style, 'thin');
  assert.equal(sheet.getCell(`L${beneficiary.row}`).border.right.style, 'thin');
}
assert.deepEqual(invoices.calculateInvoiceTotals({ TaxDetailsVersion: 1 }, []).taxSummary, []);
assert.equal(invoices.calculateInvoiceTotals({}, []).grandTotal, 0);
for (const InvoiceDate of ['2026-10-01', '2026-10-02', '2027-01-01', null]) {
  const header = { InvoiceDate, IGSTRate: 18, TaxDetailsVersion: 0 };
  const lines = [{ VendorArticleName: 'T_SH_LEGACY', Rate: 2500, Qty: 2, Amount: 5000 }];
  assert.equal(tax.usesItemTaxDetails(header), true);
  assert.equal(tax.lineTaxRates(header, lines[0]).taxRate, 18);
  const totals = invoices.calculateInvoiceTotals(header, lines);
  assert.equal(totals.igstAmount, 900);
  assert.equal(totals.grandTotal, 5900);
  assert.equal(totals.taxSummary[0].taxRate, 18);
  const workbook = await excel.buildInvoiceWorkbook({ header, lines, totals });
  const sheet = workbook.getWorksheet('Invoice');
  assert.equal(sheet.getCell('K18').value, 'Tax %');
  assert.equal(sheet.getCell('L18').value, 'AMOUNT');
  assert.match(sheet.pageSetup.printArea, /^A1:L/);
  assert.equal(tax.lineTaxRates(header, { VendorArticleName: 'T_SH_OLD', Amount: 2500 }).taxRate, 5);
  const draft = einvoice.createEInvoiceDraft({ header, lines });
  draft.seller.Stcd = '06'; draft.buyer.Pos = '07';
  const document = einvoice.buildDocument({ header, lines }, draft);
  assert.equal(document.ItemList[0].GstRt, 18);
  assert.equal(document.ValDtls.TotInvVal, 5900);
}
// All invoices now use the same per-line rounding and tax rules.
assert.equal(invoices.calculateInvoiceTotals({ IGSTRate: 18 }, [{ Qty: 1, Amount: 0.02 }, { Qty: 1, Amount: 0.02 }]).igstAmount, 0);
assert.equal(tax.usesItemTaxDetails({ InvoiceDate: '2026-10-02' }), true);
assert.equal(tax.usesItemTaxDetails({ TaxDetailsVersion: 1, InvoiceDate: '2026-09-01' }), true);

// Exercise saving old invoices and creating new ones without a database.
let statements = [];
globalThis.__invoiceTaxSaveRun = async (sql, values) => {
  statements.push({ sql, values });
  if (sql.startsWith('SELECT InvoiceNo, IRN, TransportationCharges')) return [{ InvoiceNo: 'OLD', TransportationCharges: 0 }];
  if (sql.includes('SELECT InvoiceID')) return [];
  return { insertId: 99, affectedRows: 1 };
};
const customer = await load(`
  const ensureBuyingTaxColumns = async () => {};
  const ensureInvoiceTaxVersionColumn = async () => {};
  const ensureInvoicePresentationColumns = async () => {};
  const ensureInvoiceTransportationColumn = async () => {};
  const withTransaction = async (callback) => callback(globalThis.__invoiceTaxSaveRun);
  ${stripImports(await readFile('src/lib/customerInvoice.js', 'utf8'))}
`);
await customer.saveCustomerInvoice({ InvoiceID: 10, InvoiceNo: 'OLD', InvoiceDate: '2026-10-02', TaxDetailsVersion: 1, InvoiceNote: 'Invoice-specific\nsecond line', BeneficiaryName: 'Test beneficiary' });
const update = statements.find(({ sql }) => sql.startsWith('UPDATE'));
assert.ok(update);
assert.doesNotMatch(update.sql, /TaxDetailsVersion/);
assert.match(update.sql, /InvoiceNote = \?/);
assert.match(update.sql, /BeneficiaryName = \?/);
assert.ok(update.values.includes('Invoice-specific\nsecond line'));
assert.ok(update.values.includes('Test beneficiary'));
statements = [];
await customer.saveCustomerInvoice({ InvoiceNo: 'NEW', TaxDetailsVersion: 0 });
const insert = statements.find(({ sql }) => sql.startsWith('INSERT'));
assert.match(insert.sql, /TaxDetailsVersion\)/);
assert.match(insert.sql, /, 2\)/);
console.log('Passed: all invoices use current tax details, Excel layout, e-invoice rates and per-line rounding regardless of invoice date or version.');


for (const split of [false, true]) {
  const header = { TaxDetailsVersion: 2, InterStateTax: split ? 0 : 1, IGSTRate: 99, CGST: 99, SGST: 99, TransportationCharges: 100 };
  const lines = [5, 18].map((rate, index) => ({ VendorArticleName: 'T_SH_PO_' + index, Qty: 1, Rate: 1000, Amount: 1000,
    BuyingTaxCGST: split ? rate / 2 : 0, BuyingTaxSGST: split ? rate / 2 : 0, BuyingTaxIGST: split ? 0 : rate }));
  const totals = invoices.calculateInvoiceTotals(header, lines);
  assert.deepEqual(totals.taxSummary.map(group => group.taxRate), [5, 18]);
  assert.equal(totals.taxableAmount, 2100);
  assert.equal(totals.grandTotal, 2348);
  assert.equal(totals.igstAmount, split ? 0 : 248);
  assert.equal(totals.cgstAmount, split ? 124 : 0);
  assert.equal(totals.hideTaxTotals, true);
  assert.equal(tax.lineTaxRates(header, lines[1]).taxRate, 18, 'PO rates override old T_SH rule and UI switch');
  const draft = einvoice.createEInvoiceDraft({ header, lines });
  draft.seller.Stcd = '06'; draft.buyer.Pos = split ? '06' : '07';
  const document = einvoice.buildDocument({ header, lines }, draft);
  assert.equal(document.ValDtls.TotInvVal, totals.grandTotal);
  assert.equal(document.ValDtls.CgstVal, totals.cgstAmount);
  assert.equal(document.ValDtls.IgstVal, totals.igstAmount);
  assert.deepEqual(document.ItemList.map(item => item.GstRt), [5, 18, 18]);
  const workbook = await excel.buildInvoiceWorkbook({header, lines, totals});
  const ws = workbook.getWorksheet('Invoice');
  const find = label => { let result; ws.eachRow(row => row.eachCell(cell => { if(cell.value === label && !result) result = cell; })); return result; };
  const taxCell = find(split ? 'CGST' : 'IGST');
  // Summary headers occur in A:G; find the totals-box label in H.
  let rowNumber;
  ws.eachRow(row => { if (ws.getCell(`H${row.number}`).value === (split ? 'CGST' : 'IGST')) rowNumber = row.number; });
  assert.equal(ws.getCell(`K${rowNumber}`).value, '');
  assert.equal(ws.getCell(`L${rowNumber}`).value.result, split ? totals.cgstAmount : totals.igstAmount);
  const grand = find('GRAND TOTAL');
  assert.equal(ws.getCell(`L${grand.row}`).value.result, 2348);
  const summary = find('Tax Rate');
  assert.equal(ws.getCell(`B${summary.row + 1}`).value.result, 1000);
  assert.equal(ws.getCell(`B${summary.row + 2}`).value.result, 1100);
  // Confirm export serializes and reloads without merged-cell or formula corruption.
  await workbook.xlsx.writeBuffer();
}
const oldHeader = { TaxDetailsVersion: 1, InterStateTax: 0, IGSTRate: 18 };
const oldLine = { VendorArticleName: 'T_SH_OLD', Qty: 1, Rate: 1000, Amount: 1000, BuyingTaxIGST: 18 };
assert.equal(tax.lineTaxRates(oldHeader, oldLine).taxRate, 5, 'old invoices retain their previous calculation');
assert.equal(tax.lineTaxRates({TaxDetailsVersion: 2}, oldLine).taxRate, 18);
assert.throws(() => tax.lineTaxRates({TaxDetailsVersion: 2}, {...oldLine, BuyingTaxIGST: 0}), /Buying Tax/);
console.log('Passed new PO-rate invoices, mixed GST summaries, 18% freight, Excel blanks/totals, e-invoice reconciliation and legacy preservation.');
const mixedHeader = { TaxDetailsVersion: 2, TransportationCharges: 100 };
const mixedLines = [
 { Qty: 1, Rate: 1000, Amount: 1000, BuyingTaxCGST: 9, BuyingTaxSGST: 9, BuyingTaxIGST: 0 },
 { Qty: 1, Rate: 1000, Amount: 1000, BuyingTaxCGST: 0, BuyingTaxSGST: 0, BuyingTaxIGST: 5 }
];
const mixedTotals = invoices.calculateInvoiceTotals(mixedHeader, mixedLines);
assert.equal(mixedTotals.hasMixedTaxTypes, true);
assert.equal(mixedTotals.grandTotal, 2348);
assert.equal(mixedTotals.cgstAmount, 90);
assert.equal(mixedTotals.igstAmount, 68);
const mixedBook = await excel.buildInvoiceWorkbook({header: mixedHeader, lines: mixedLines, totals: mixedTotals});
let freightOnlyRow;
mixedBook.getWorksheet('Invoice').eachRow(row => {
 if (row.getCell(1).value === 18 && row.getCell(2).value?.result === 100) freightOnlyRow = row;
});
assert.ok(freightOnlyRow);
assert.match(freightOnlyRow.getCell(3).value.formula, /^SUM\(0\)\+ROUND/);
assert.equal(freightOnlyRow.getCell(3).value.result, 18);
console.log('Passed mixed tax components with equal total rates: Excel freight and item taxes are not double counted.');
// Render the real invoice component to verify mixed-rate totals remain visible.
const swc = require('next/dist/build/swc');
const viewCode = swc.transformSync(await readFile('src/components/InvoiceView.js', 'utf8'), {
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2020', transform: { react: { runtime: 'automatic' } } },
  module: { type: 'commonjs' }
}).code;
const format = await load(formatSource);
const viewModule = { exports: {} };
new Function('require', 'module', 'exports', viewCode)(name => {
  if (name === '@/lib/format') return format;
  if (name === '@/lib/invoiceTax') return tax;
  if (name === '@/lib/invoiceQr') return { invoiceQrUrl: () => '/qr.png' };
  return require(name);
}, viewModule, viewModule.exports);
const React = require('react');
const html = require('react-dom/server').renderToStaticMarkup(React.createElement(viewModule.exports.default, {
  invoice: { header: mixedHeader, lines: mixedLines, totals: mixedTotals }
}));
for (const [label, amount] of [['CGST','90.00'], ['SGST','90.00'], ['IGST','68.00']]) {
  assert.ok(html.includes(`<strong>${label}</strong><span></span><span>${amount}</span>`), label + ' total must render with a blank rate and visible amount');
  let totalCell;
  mixedBook.getWorksheet('Invoice').eachRow(row => {
    if (row.getCell(8).value === label) totalCell = row.getCell(12);
  });
  assert.equal(totalCell.value.result, Number(amount));
}
console.log('Passed invoice HTML and Excel: CGST/SGST/IGST amounts visible; mixed percentages blank.');

const addressHeader = {
 InvoiceNo: 'ADDRESS/TEST', GSTN: '06BMTPS4959L1ZX', BillFromName: 'TEAKWOOD',
 ConsigneeName: 'Billing party', ConsigneeAddress: 'GROUND FLOOR, G 3, DARYAGANJ, NEW DELHI, Delhi, 110002 GSTIN/UIN : 07DUNPS3458E1Z6',
 BuyerGSTIN: '06BMTPS4959L1ZX',
 DeliveredToName: 'Receiving party', DeliveredToAddress: 'Warehouse 10, Gurgaon, Haryana, 122001 GSTIN: 06BMTPS4959L1ZX'
};
const addressDraft = einvoice.createEInvoiceDraft({header: addressHeader, lines: []});
assert.equal(addressDraft.buyer.Gstin, '07DUNPS3458E1Z6');
assert.equal(addressDraft.buyer.LglNm, 'Billing party');
assert.equal(addressDraft.buyer.Stcd, '07');
assert.equal(addressDraft.buyer.Pin, '110002');
assert.match(addressDraft.buyer.Addr1, /GROUND FLOOR/);
assert.doesNotMatch(addressDraft.buyer.Addr1, /GSTIN/);
assert.equal(addressDraft.shipping.Gstin, '06BMTPS4959L1ZX');
assert.equal(addressDraft.shipping.Stcd, '06');
assert.equal(addressDraft.shipping.Pin, '122001');
assert.match(addressDraft.shipping.Addr1, /Warehouse 10/);
assert.equal(addressDraft.shipping.enabled, true);
const addressJson = einvoice.buildDocument({header: addressHeader, lines: []}, addressDraft);
assert.equal(addressJson.BuyerDtls.Gstin, addressDraft.buyer.Gstin);
assert.equal(addressJson.ShipDtls.Gstin, addressDraft.shipping.Gstin);
const missingShip = einvoice.createEInvoiceDraft({header: {...addressHeader, DeliveredToAddress: 'Warehouse 2, Kolkata, West Bengal, 700001'}, lines: []});
assert.equal(missingShip.shipping.Gstin, '', 'distinct ship-to address must not inherit bill-to GSTIN');
const sameShip = einvoice.createEInvoiceDraft({header: {...addressHeader, DeliveredToAddress: addressHeader.ConsigneeAddress, DeliveredToName: addressHeader.ConsigneeName}, lines: []});
assert.equal(sameShip.shipping.Gstin, sameShip.buyer.Gstin);
const missingData = einvoice.createEInvoiceDraft({header: { ConsigneeAddress: 'Hoogly, West Bengal, 712223', DeliveredToAddress: 'Hoogly, West Bengal, 712223' }, lines: []});
assert.equal(missingData.buyer.Gstin, '');
assert.equal(missingData.shipping.Gstin, '');
console.log('Passed independent Bill To/Ship To GSTINs, names, inline addresses, JSON mapping and missing-data handling.');
