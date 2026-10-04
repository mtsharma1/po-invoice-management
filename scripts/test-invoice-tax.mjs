import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const load = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const taxSource = await readFile('src/lib/invoiceTax.js', 'utf8');
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

for (const selected of [0, 1]) {
  const header = { TaxDetailsVersion: 1, InterStateTax: selected, CGST: selected ? 9 : 0, SGST: selected ? 9 : 0, IGSTRate: selected ? 0 : 18 };
  header.InvoiceNote = 'Deliver before Friday.\nContact receiving desk.';
  header.BeneficiaryName = 'TEAKWOOD';
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
  assert.equal(sheet.getCell('K18').value, 'Tax %');
  assert.equal(sheet.getCell('L18').value, 'AMOUNT');
  assert.equal(sheet.getCell('K19').value, 5);
  assert.equal(sheet.getCell('K20').value, 18);
  assert.equal(sheet.getCell('L19').value.result, 2500);
  let summaryRow;
  sheet.eachRow((row) => { if (row.getCell(1).value === 'Tax Rate') summaryRow = row.number; });
  assert.ok(summaryRow > 30);
  assert.equal(sheet.getCell(`A${summaryRow + 1}`).value, 5);
  assert.equal(sheet.getCell(`C${summaryRow + 1}`).value.result || 0, selected ? 0 : 125);
  assert.equal(sheet.getCell(`D${summaryRow + 1}`).value.result || 0, selected ? 62.5 : 0);
  assert.equal(sheet.getCell(`G${summaryRow + 2}`).value.result, 7080);
  assert.match(sheet.pageSetup.printArea, /L/);
  const cellsWithValue = (value) => {
    const found = [];
    sheet.eachRow(row => row.eachCell(cell => { if (cell.value === value) found.push(cell); }));
    return found;
  };
  const noteCell = cellsWithValue(`Note\n${header.InvoiceNote}`)[0];
  assert.ok(noteCell.row < summaryRow);
  const beneficiary = cellsWithValue('BENEFICIARY NAME')[0];
  assert.ok(beneficiary);
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
  assert.equal(tax.usesItemTaxDetails(header), false);
  assert.equal(tax.lineTaxRates(header, lines[0]).taxRate, 18);
  const totals = invoices.calculateInvoiceTotals(header, lines);
  assert.equal(totals.igstAmount, 900);
  assert.equal(totals.grandTotal, 5900);
  assert.equal(totals.taxSummary, undefined);
  const workbook = await excel.buildInvoiceWorkbook({ header, lines, totals });
  const sheet = workbook.getWorksheet('Invoice');
  assert.equal(sheet.getCell('K18').value, 'AMOUNT');
  assert.equal(sheet.getCell('L18').value, null);
  assert.match(sheet.pageSetup.printArea, /^A1:K/);
  sheet.eachRow((row) => assert.notEqual(row.getCell(1).value, 'Tax Rate'));
  const draft = einvoice.createEInvoiceDraft({ header, lines });
  draft.seller.Stcd = '06'; draft.buyer.Pos = '07';
  const document = einvoice.buildDocument({ header, lines }, draft);
  assert.equal(document.ItemList[0].GstRt, 18);
  assert.equal(document.ValDtls.TotInvVal, 5900);
}
// Preserve aggregate rounding on old invoices, rather than rounding each line.
assert.equal(invoices.calculateInvoiceTotals({ IGSTRate: 18 }, [{ Qty: 1, Amount: 0.02 }, { Qty: 1, Amount: 0.02 }]).igstAmount, 0.01);
assert.equal(tax.usesItemTaxDetails({ InvoiceDate: '2026-10-02' }), false);
assert.equal(tax.usesItemTaxDetails({ TaxDetailsVersion: 1, InvoiceDate: '2026-09-01' }), true);

// Exercise saving old invoices and creating new ones without a database.
let statements = [];
globalThis.__invoiceTaxSaveRun = async (sql, values) => {
  statements.push({ sql, values });
  if (sql.includes('SELECT InvoiceID')) return [];
  return { insertId: 99, affectedRows: 1 };
};
const customer = await load(`
  const ensureInvoiceTaxVersionColumn = async () => {};
  const ensureInvoicePresentationColumns = async () => {};
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
assert.match(insert.sql, /, 1\)/);
console.log('Passed: new invoice mixed taxes/Excel/e-invoice, and legacy invoices retain old rates, aggregate rounding, and workbook layout regardless of invoice date.');
