const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
(async () => {
  let source = fs.readFileSync('src/components/InvoiceView.js', 'utf8').replace(/^import .*;\r?$/gm, '');
  source = `const React = require('react');
const text = v => String(v || ''); const dateText = text; const dateTimeText = text;
const splitLines = v => String(v || '').split('\\n'); const qty = text;
const money = v => Number(v || 0).toLocaleString('en-IN', {minimumFractionDigits:2});
const invoiceQrUrl = () => ''; const usesItemTaxDetails = h => h?.TaxDetailsVersion === 1;
const lineTaxRates = (h,l) => ({taxRate: l.taxRate});\n` + source;
  await require('next/dist/build/swc').loadBindings();
  const { code } = await require('next/dist/build/swc').transform(source, { filename: 'InvoiceView.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' } });
  const mod = new Module(path.resolve('tmp/fixture.cjs'), module); mod.paths = module.paths; mod._compile(code, path.resolve('tmp/fixture.cjs'));
  const invoice = { header: { TaxDetailsVersion: 1, InvoiceNo: 'PREVIEW', BillFromName: 'TEAKWOOD', BillFromAddress: 'Gurgaon, Haryana', DispatchFromName: 'TEAKWOOD', DispatchFromAddress: 'Jhajjar, Haryana', ConsigneeName: 'Example Buyer', DeliveredToName: 'Example Buyer', InvoiceNote: 'Trolly Bag, Shoes, Suitcase', BeneficiaryName: 'TEAKWOOD', AccountNo: '123456789', IFSCCode: 'TEST0000123', BankName: 'EXAMPLE BANK', BranchName: 'GURGAON', TotalInWords: 'RUPEES SEVEN THOUSAND NINE HUNDRED TWENTY SIX ONLY' }, lines: [{POID:1,SKUCode:'T_TR_INDIA_B1_G7616_01',VendorArticleName:'T_TR_INDIA_B1_G7616_01', HSNCode:'42021250', Qty:5,Rate:1102,Amount:5510,taxRate:18},{POID:2,SKUCode:'T_SH_INDIA_B1_BL_02',VendorArticleName:'T_SH_INDIA_B1_BL_02',HSNCode:'42021250',Qty:1,Rate:1356,Amount:1356,taxRate:5}], totals: { totalQty:6,taxableAmount:6866,isInterState:true,cgstRate:null,sgstRate:null,cgstAmount:529.8,sgstAmount:529.8,roundOff:0.4,grandTotal:7926,taxSummary:[{taxRate:5,taxableAmount:1356,cgstAmount:33.9,sgstAmount:33.9,igstAmount:0,totalTax:67.8,totalAmount:1423.8},{taxRate:18,taxableAmount:5510,cgstAmount:495.9,sgstAmount:495.9,igstAmount:0,totalTax:991.8,totalAmount:6501.8}] } };
  const html = renderToStaticMarkup(React.createElement(mod.exports.default,{invoice}));
  const { chromium } = require('C:/Users/Mithlesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page = await browser.newPage({viewport:{width:1450,height:1100}});
  await page.setContent('<style>'+fs.readFileSync('src/app/globals.css','utf8')+'</style>'+html);
  await page.screenshot({path:'tmp/invoice-layout-screen.png',fullPage:true});
  const rect = selector => page.locator(selector).boundingBox();
  const note = await rect('.invoice-note-cell'), bank = await rect('.bank-box'), summary = await rect('.invoice-tax-summary'), totals = await rect('.totals-box');
  if (Math.abs(note.x+note.width-bank.x)>2 || Math.abs(note.height-bank.height)>2 || summary.x>=totals.x) throw new Error('Layout alignment failed');
  await page.emulateMedia({media:'print'});
  const borders = await page.evaluate(() => ({
    top: getComputedStyle(document.querySelector('.totals-box')).borderTopWidth,
    right: [...document.querySelectorAll('.totals-box > div > :last-child')].map(cell => getComputedStyle(cell).borderRightWidth),
    frame: getComputedStyle(document.querySelector('.invoice-main-block')).borderRightWidth,
  }));
  if (borders.top !== '0px' || borders.right.some(width => width !== '0px') || borders.frame !== '1px') throw new Error(JSON.stringify(borders));
  await page.pdf({path:'tmp/pdfs/invoice-border-check.pdf',preferCSSPageSize:true,printBackground:true});
  await page.screenshot({path:'tmp/invoice-layout-print.png',fullPage:true});
  await browser.close(); console.log('Screen alignment and print previews verified.');
})().catch(error => { console.error(error); process.exit(1); });

