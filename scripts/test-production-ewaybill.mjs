import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const api = await load(await readFile('src/lib/whitebooks.js', 'utf8'));
process.env.WHITEBOOKS_EWAYBILL_ENV = 'production';
for (const key of ['EMAIL', 'USERNAME', 'PASSWORD', 'IP_ADDRESS', 'CLIENT_ID', 'CLIENT_SECRET', 'GSTIN', 'IRP']) {
  process.env['WHITEBOOKS_EWAYBILL_PRODUCTION_' + key] = 'eway-prod-' + key;
  process.env['WHITEBOOKS_PRODUCTION_' + key] = 'einvoice-prod-' + key;
  process.env['WHITEBOOKS_' + key] = 'sandbox-' + key;
}
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, options) => {
    assert.equal(url.origin, 'https://api.whitebooks.in');
    assert.equal(url.pathname, '/ewaybillapi/v1.03/authenticate');
    assert.equal(url.searchParams.get('username'), 'eway-prod-USERNAME');
    assert.equal(url.searchParams.get('irp'), 'eway-prod-IRP');
    assert.equal(options.headers.client_id, 'eway-prod-CLIENT_ID');
    assert.equal(options.headers.client_secret, 'eway-prod-CLIENT_SECRET');
    return Response.json({ status_cd: '1', data: { authtoken: 'private-token' } });
  };
  const auth = await api.authenticateWhitebooksEwayBill();
  globalThis.fetch = async (url, options) => {
    assert.equal(url.origin, 'https://api.whitebooks.in');
    assert.equal(url.pathname, '/ewaybillapi/v1.03/ewayapi/genewaybill');
    assert.equal(options.headers.client_id, 'eway-prod-CLIENT_ID');
    assert.equal(JSON.parse(options.body).docNo, 'TEST/1');
    return Response.json({ status_cd: '1', data: { ewayBillNo: 123456789012, ewayBillDate: 'generated', validUpto: 'expiry' } });
  };
  assert.deepEqual(await api.generateStandaloneWhitebooksEwayBill({ docNo: 'TEST/1' }, auth), { EwbNo: 123456789012, EwbDt: 'generated', EwbValidTill: 'expiry' });
  assert.equal(api.getEwayBillConfig('sandbox').values.client_id, 'sandbox-CLIENT_ID');
  delete process.env.WHITEBOOKS_EWAYBILL_PRODUCTION_PASSWORD;
  await assert.rejects(api.authenticateWhitebooksEwayBill, /Configure all production/);
} finally { globalThis.fetch = originalFetch; }

console.log('Standalone e-way bill credential isolation and endpoint checks passed.');
