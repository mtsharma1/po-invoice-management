import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
async function load(path, dependencies = {}) {
  let source = await readFile(path, 'utf8');
  for (const [name, value] of Object.entries(dependencies)) source = source.replaceAll(`'${name}'`, `'${value}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { makeEwayBillPdfData, enrichEwayBillPdfData } = await load('src/lib/ewayBillPdfData.js');
const { buildEwayBillPdf, portalDate, summarizeHsnItems, ewayBillQrPayload } = await load('src/lib/ewayBillPdf.js', Object.fromEntries(['pdfkit', 'qrcode', 'bwip-js'].map(name => [name, pathToFileURL(require.resolve(name)).href])));
const groupedArticles = Array.from({ length: 30 }, (_, i) => ({ hsn: '42021250', description: i ? `ARTICLE_${i}` : 'T_TR_INDIA_B1_PA_12' }));
assert.deepEqual(summarizeHsnItems(groupedArticles), ['42021250 - T_TR_INDIA_B1_PA_12 (+29)']);
assert.deepEqual(summarizeHsnItems([...groupedArticles, groupedArticles[0], { hsn: '64039990', description: 'T_SH_TEST' }]), ['42021250 - T_TR_INDIA_B1_PA_12 (+29)', '64039990 - T_SH_TEST']);
assert.deepEqual(summarizeHsnItems([]), []);
assert.equal(portalDate('2026-10-03 12:49:00', true), '03-10-2026 12:49 PM');
assert.equal(portalDate('15/09/2026 01:19 PM', true), '15-09-2026 01:19 PM');
assert.equal(portalDate('2026-10-04 00:05:00', true), '04-10-2026 12:05 AM');
assert.equal(portalDate('2026-10-04 23:59:00'), '04-10-2026');
const fixture = {
  environment: 'sandbox',
  submission: { state: 'succeeded', request: { Irn: 'a'.repeat(64), TransMode: '1', Distance: 230, VehNo: 'HR01AB1234', VehType: 'R', TransName: 'Example Transport' }, result: { EwbNo: '123456789012', EwbDt: '04/10/2026 10:00:00', EwbValidTill: '06/10/2026 23:59:00' } },
  irnRecord: { request: { DocDtls: { No: 'TEST/001', Dt: '04/10/2026', Typ: 'INV' }, SellerDtls: { Gstin: '06EXAMPLE0000A1Z0', LglNm: 'Example Supplier', Addr1: 'Industrial Road', Loc: 'Gurgaon', Pin: 122001 }, BuyerDtls: { Gstin: '09EXAMPLE0000A1Z0', LglNm: 'Example Buyer', Addr1: 'Warehouse Road', Loc: 'Noida', Pin: 201301 }, ItemList: [{ HsnCd: '42021250', PrdDesc: 'Travel suitcase' }], ValDtls: { TotInvVal: 7926 } }, result: { Irn: 'a'.repeat(64), AckNo: '123456789012345', AckDt: '04/10/2026 09:00:00' } },
  invoice: { header: { InvoiceNo: 'CHANGED', IRN: 'production-only' }, totals: { grandTotal: 99999 } },
  transport: { VehNo: 'CHANGED' },
};
const data = makeEwayBillPdfData(fixture);
assert.equal(data.invoiceNo, 'TEST/001');
assert.equal(data.goodsValue, '7,926.00');
assert.equal(data.vehicle, 'HR01AB1234');
assert.equal(data.generatedBy, '');
assert.equal(data.validFrom, '');
assert.equal(data.vehicleEnteredDate, '');
assert.equal(data.vehicleEnteredBy, '');
assert.equal(data.dispatch, 'Gurgaon 122001');
const places = makeEwayBillPdfData({ ...fixture, irnRecord: { ...fixture.irnRecord, request: { ...fixture.irnRecord.request, DispDtls: { Loc: 'JHAJJAR', Stcd: '06', Pin: 124103 }, ShipDtls: { Loc: 'HYDERABAD', Stcd: '36', Pin: 501401 } } } });
assert.equal(places.dispatch, 'JHAJJAR HARYANA 124103');
assert.equal(places.delivery, 'HYDERABAD TELANGANA 501401');
assert.throws(() => makeEwayBillPdfData({ ...fixture, submission: { ...fixture.submission, state: 'uncertain' } }), /successfully saved/);
assert.throws(() => makeEwayBillPdfData({ ...fixture, irnRecord: { result: { Irn: 'b'.repeat(64) } } }), /do not match/);
const standalone = makeEwayBillPdfData({ ...fixture, irnRecord: null, submission: { ...fixture.submission, request: { docNo: 'STANDALONE', totInvValue: 100, transMode: '2', transactionType: 2 } } });
assert.equal(standalone.irn, '');
assert.equal(standalone.mode, 'Rail');
assert.equal(standalone.transaction, 'Bill To - Ship To');
assert.equal(standalone.invoiceNo, 'STANDALONE');
const fallback = makeEwayBillPdfData({ ...fixture, irnRecord: null, submission: { ...fixture.submission, request: {} } });
assert.ok(fallback.notes.some(note => note.includes('current saved invoice')));
assert.equal(fallback.vehicle, 'CHANGED');
// Exercise authorization and environment guards without a database or provider call.
let allowed = false, reads = 0, lookupFailure = false;
class WhitebooksError extends Error {}
globalThis.__ewayTest = {
  WhitebooksError,
  getCurrentSession: async () => ({}), canAccessFeature: () => allowed,
  FEATURES: { E_INVOICE: 'e-invoice' }, getEwayBillEnvironment: () => 'sandbox',
  getEwayBillPdfData: async () => { reads++; if (lookupFailure) throw new WhitebooksError('Provider lookup unavailable.'); return data; },
  buildEwayBillPdf: async () => Buffer.from('%PDF-test'),
};
let routeSource = await readFile('src/app/api/whitebooks/ewaybill/pdf/route.js', 'utf8');
routeSource = routeSource.replace(/^import .*;\r?\n/gm, '');
const route = await import(`data:text/javascript;base64,${Buffer.from('const { WhitebooksError, getCurrentSession, canAccessFeature, FEATURES, getEwayBillEnvironment, getEwayBillPdfData, buildEwayBillPdf } = globalThis.__ewayTest;\n' + routeSource).toString('base64')}`);
const request = query => new Request(`http://localhost/api/whitebooks/ewaybill/pdf?${query}`);
assert.equal((await route.GET(request('invoiceNo=TEST&environment=sandbox'))).status, 403);
allowed = true;
assert.equal((await route.GET(request('environment=sandbox'))).status, 400);
assert.equal((await route.GET(request('invoiceNo=TEST&environment=production'))).status, 409);
assert.equal(reads, 0);
const response = await route.GET(request('invoiceNo=TEST&environment=sandbox'));
assert.equal(response.status, 200);
assert.equal(response.headers.get('content-type'), 'application/pdf');
assert.equal(response.headers.get('cache-control'), 'no-store');
assert.equal(reads, 1);
lookupFailure = true;
const failed = await route.GET(request('invoiceNo=TEST&environment=sandbox'));
assert.equal(failed.status, 502);
assert.equal((await failed.json()).error, 'Provider lookup unavailable.');
delete globalThis.__ewayTest;
await mkdir('tmp/pdfs', { recursive: true });
await writeFile('tmp/pdfs/ewaybill-test.pdf', await buildEwayBillPdf(data));
await writeFile('tmp/pdfs/ewaybill-hsn-summary-test.pdf', await buildEwayBillPdf({ ...data, items: groupedArticles }));
await writeFile('tmp/pdfs/ewaybill-production-layout-test.pdf', await buildEwayBillPdf({ ...data, environment: 'production' }));
const enriched = enrichEwayBillPdfData(data, { ewbNo: data.number, docNo: data.invoiceNo, userGstin: '06EXAMPLE0000A1Z0', fromGstin: '06EXAMPLE0000A1Z0', fromTrdName: 'Example Supplier', actualDist: 33, VehiclListDetails: [{ transMode: '1', vehicleNo: 'HR01AB1234', enteredDate: '04/10/2026 10:00:00 AM', userGSTINTransin: '06EXAMPLE0000A1Z0', transDocDate: '04/10/2026' }] });
await writeFile('tmp/pdfs/ewaybill-details-test.pdf', await buildEwayBillPdf(enriched));
await writeFile('tmp/pdfs/ewaybill-date-fallback-test.pdf', await buildEwayBillPdf({ ...enriched, vehicleHistory: [{ ...enriched.vehicleHistory[0], vehicle: 'RJ09GD5502', transportDocumentDate: '', vehicleEnteredDate: '03/10/2026 12:49:00 PM' }] }));
await writeFile('tmp/pdfs/ewaybill-history-test.pdf', await buildEwayBillPdf({ ...enriched, vehicleHistory: Array.from({ length: 35 }, (_, i) => ({ ...enriched.vehicleHistory[0], vehicle: `HR01AB${String(1000+i)}` })) }));
await writeFile('tmp/pdfs/ewaybill-long-test.pdf', await buildEwayBillPdf({ ...data, items: Array.from({ length: 90 }, (_, i) => ({ hsn: '42021250', description: `Item ${i + 1} - travel suitcase with a long article description` })) }));
console.log('E-way bill PDF mapping checks passed; normal and multi-page fixtures generated.');
const qrExample = { number: '302334427543', generatedBy: '06BMTPS4959L1ZX TEAKWOOD', generated: '15/09/2026 01:19 PM' };
assert.equal(ewayBillQrPayload(qrExample), '302334427543/06BMTPS4959L1ZX/2026-09-15 13:19:00');
assert.equal(ewayBillQrPayload({ ...qrExample, generated: '2026-09-15 13:19:00' }), '302334427543/06BMTPS4959L1ZX/2026-09-15 13:19:00');
assert.equal(ewayBillQrPayload({ ...qrExample, generated: '15-09-2026 12:05:03 AM' }), '302334427543/06BMTPS4959L1ZX/2026-09-15 00:05:03');
assert.equal(ewayBillQrPayload({ ...qrExample, generatedBy: '', supplier: '06BMTPS4959L1ZX\nTEAKWOOD' }), '302334427543/06BMTPS4959L1ZX/2026-09-15 13:19:00');
assert.equal(ewayBillQrPayload({ ...qrExample, generated: '' }), '');
