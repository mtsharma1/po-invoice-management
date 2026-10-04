import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const api = await load(await readFile('src/lib/whitebooks.js', 'utf8'));
const { enrichEwayBillPdfData } = await load(await readFile('src/lib/ewayBillPdfData.js', 'utf8'));
const originalFetch = globalThis.fetch;
const before = { ...process.env };
const base = { number: '123456789012', invoiceNo: 'TEST/1', distance: '0' };
const details = {
  ewbNo: base.number, docNo: base.invoiceNo, userGstin: '06TEST0000000000',
  fromGstin: '06TEST0000000000', fromTrdName: 'TEST SUPPLIER',
  actualDist: 33, validUpto: '16/09/2026 11:59:00 PM',
  VehiclListDetails: [
    { transMode: '1', vehicleNo: 'HR01AB1234', enteredDate: '16/09/2026 01:19:00 PM', userGSTINTransin: '06TEST0000000000', transDocDate: '15/09/2026', password: 'DO-NOT-COPY' },
    { transMode: '1', vehicleNo: 'HR01AB1000', enteredDate: '15/09/2026 01:19:00 PM', userGSTINTransin: '06TEST0000000000' },
  ], AuthToken: 'DO-NOT-COPY',
};
try {
  for (const key of ['EMAIL', 'USERNAME', 'PASSWORD', 'IP_ADDRESS', 'CLIENT_ID', 'CLIENT_SECRET', 'GSTIN']) process.env['WHITEBOOKS_' + key] = 'mock-' + key;
  let calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url.pathname);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(url.origin, 'https://apisandbox.whitebooks.in');
    if (url.pathname.endsWith('/authenticate')) return Response.json({ status_cd: '1', data: { authtoken: 'SECRET' } });
    assert.equal(url.searchParams.get('ewbNo'), base.number);
    assert.equal(url.searchParams.has('password'), false);
    assert.equal(options.headers['auth-token'], undefined);
    return Response.json({ status_cd: '1', data: details });
  };
  const fetched = await api.getWhitebooksEwayBillDetails(base.number, 'sandbox');
  assert.equal(calls.length, 2); assert.ok(calls.every(p => !/genewaybill|GENERATE/.test(p)));
  assert.equal(fetched.AuthToken, undefined); assert.equal(fetched.VehiclListDetails[0].password, undefined);
  const mapped = enrichEwayBillPdfData(base, fetched);
  assert.equal(mapped.generatedBy, '06TEST0000000000  TEST SUPPLIER');
  assert.equal(mapped.validFrom, '15/09/2026 01:19:00 PM');
  assert.equal(mapped.distance, '33');
  assert.equal(mapped.vehicleHistory[0].vehicle, 'HR01AB1234');
  assert.equal(mapped.vehicleHistory[0].vehicleEnteredDate, '16/09/2026 01:19:00 PM');
  assert.equal(mapped.vehicleHistory[0].vehicleEnteredBy, '06TEST0000000000');
  assert.equal(mapped.vehicleHistory[0].transportDocumentDate, '15/09/2026');
  assert.equal(mapped.vehicleHistory[1].transportDocumentDate, '');
  assert.throws(() => enrichEwayBillPdfData({ ...base, invoiceNo: 'OTHER' }, fetched), /do not match/);
  assert.equal(enrichEwayBillPdfData(base, { ...fetched, VehiclListDetails: [] }).validFrom, '');
  assert.equal(enrichEwayBillPdfData(base, { ...fetched, userGstin: 'UNRELATED' }).generatedBy, 'UNRELATED');
  globalThis.fetch = async url => Response.json(url.pathname.endsWith('/authenticate') ? { status_cd: '1' } : { status_cd: '1', data: { ...details, ewbNo: '999999999999' } });
  await assert.rejects(() => api.getWhitebooksEwayBillDetails(base.number, 'sandbox'), /matching full/);
  globalThis.fetch = async () => { throw new Error('password=SECRET'); };
  await assert.rejects(() => api.getWhitebooksEwayBillDetails(base.number, 'sandbox'), error => !error.message.includes('SECRET') && /Unable to retrieve/.test(error.message));
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
  Object.assign(process.env, before);
}
console.log('Full EWB lookup, identity checks, history mapping, validity start and credential redaction passed.');
