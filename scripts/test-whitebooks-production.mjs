import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile('src/lib/whitebooks.js', 'utf8');
const api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
process.env.WHITEBOOKS_EINVOICE_ENV = 'production';
for (const field of ['EMAIL', 'USERNAME', 'PASSWORD', 'IP_ADDRESS', 'CLIENT_ID', 'CLIENT_SECRET', 'GSTIN']) {
  process.env['WHITEBOOKS_PRODUCTION_' + field] = 'prod-' + field;
  process.env['WHITEBOOKS_' + field] = 'sandbox-' + field;
}
const savedFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, options) => {
    assert.equal(url.origin, 'https://api.whitebooks.in');
    assert.equal(options.headers.client_id, 'prod-CLIENT_ID');
    assert.equal(options.headers.gstin, 'prod-GSTIN');
    assert.equal(url.searchParams.get('email'), 'prod-EMAIL');
    return Response.json({ status_cd: '1', data: { AuthToken: 'token' } });
  };
  assert.equal((await api.authenticateWhitebooks()).authToken, 'token');
  globalThis.fetch = async (url, options) => {
    assert.equal(url.origin, 'https://api.whitebooks.in');
    assert.equal(options.headers['auth-token'], 'token');
    assert.equal(JSON.parse(options.body).EwbDtls.Distance, 100);
    return Response.json({ status_cd: '1', data: { Irn: 'a'.repeat(64), AckNo: '123', EwbNo: 123456789012 } });
  };
  assert.equal((await api.generateWhitebooksIrn({ EwbDtls: { Distance: 100 } }, 'token')).EwbNo, 123456789012);
  assert.equal(api.getEInvoiceConfig('sandbox').values.client_id, 'sandbox-CLIENT_ID');
  delete process.env.WHITEBOOKS_PRODUCTION_PASSWORD;
  await assert.rejects(api.authenticateWhitebooks, /password/);
  process.env.WHITEBOOKS_EINVOICE_ENV = 'invalid';
  assert.throws(api.getEInvoiceEnvironment, /Invalid/);
} finally { globalThis.fetch = savedFetch; }
console.log('Production credential routing, combined payload, missing settings and sandbox isolation checks passed.');
