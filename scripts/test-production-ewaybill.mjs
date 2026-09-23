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

// Exercise the persistence flow with a transaction-free mock database; no live bill is generated.
let record = null, generationCalls = 0;
globalThis.__ewayTest = {
  query: async (sql, args) => {
    if (sql.startsWith('CREATE')) { assert.match(sql, /webWhitebooksProductionEwayBill/); return []; }
    if (sql.startsWith('SELECT')) { assert.match(sql, /webWhitebooksProductionEwayBill/); return record ? [record] : []; }
    if (sql.startsWith('INSERT')) { assert.match(sql, /webWhitebooksProductionEwayBill/); assert.equal(args[0], 'TEST/1'); record = { State: 'pending', ResultJson: null }; return { affectedRows: 1 }; }
    if (sql.startsWith('UPDATE')) { assert.match(sql, /webWhitebooksProductionEwayBill/); record.State = args[0]; record.ResultJson = args[1]; return { affectedRows: 1 }; }
    throw new Error('Unexpected query');
  },
  prepareEInvoice: async () => ({ valid: true, document: {} }),
  authenticateWhitebooksEwayBill: async environment => { assert.equal(environment, 'production'); return { irp: 'NIC1' }; },
  generateStandaloneWhitebooksEwayBill: async (document, auth, environment) => { generationCalls++; assert.equal(environment, 'production'); return { EwbNo: 123456789012, EwbDt: 'date', EwbValidTill: 'expiry' }; },
};
let service = (await readFile('src/lib/whitebooksEwayBill.js', 'utf8')).replace(/^import .*;$/gm, '');
service = service.replace('export function buildStandaloneEwayBill(', 'function unusedBuilder(');
const prelude = `import { createHash } from 'node:crypto';
const { query, prepareEInvoice, authenticateWhitebooksEwayBill, generateStandaloneWhitebooksEwayBill } = globalThis.__ewayTest;
class WhitebooksError extends Error {}
const getEwayBillEnvironment = () => 'production';
const getEwayBillConfig = () => ({ values: { gstin: 'TESTGSTIN' } });
const getProductionIrn = async () => null;
const getSandboxIrn = async () => { throw new Error('Production must not read sandbox'); };
const buildStandaloneEwayBill = () => ({ docNo: 'TEST/1', docDate: '23/09/2026', docType: 'INV', fromGstin: 'TESTGSTIN' });
`;
const serviceApi = await load(prelude + service);
const result = await serviceApi.generateEwayBill('TEST/1', {}, {});
assert.equal(result.state, 'succeeded');
assert.equal((await serviceApi.getEwayBill('TEST/1')).result.EwbNo, 123456789012);
await serviceApi.generateEwayBill('TEST/1', {}, {});
assert.equal(generationCalls, 1, 'Saved results must prevent another generation');
delete globalThis.__ewayTest;
console.log('Production e-way bill credential isolation, endpoint routing, invoice-linked saving and reloading checks passed.');
