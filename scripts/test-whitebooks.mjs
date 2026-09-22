import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../src/lib/whitebooks.js', import.meta.url), 'utf8');
const { authenticateWhitebooks, getWhitebooksConfigurationStatus, generateWhitebooksIrn } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('WhiteBooks authentication request and safe failure handling', async () => {
  const keys = ['EMAIL', 'USERNAME', 'PASSWORD', 'IP_ADDRESS', 'CLIENT_ID', 'CLIENT_SECRET', 'GSTIN'];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[`WHITEBOOKS_${key}`]]));
  const originalFetch = globalThis.fetch;
  try {
    for (const key of keys) process.env[`WHITEBOOKS_${key}`] = `test-${key}`;
    process.env.WHITEBOOKS_EMAIL = 'test+api@example.com';
    assert.equal(getWhitebooksConfigurationStatus().configured, true);
    globalThis.fetch = async (url, options) => {
      assert.equal(url.origin, 'https://apisandbox.whitebooks.in');
      assert.equal(url.pathname, '/einvoice/authenticate');
      assert.equal(url.searchParams.get('email'), 'test+api@example.com');
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.client_secret, 'test-CLIENT_SECRET');
      assert.equal(options.headers.ip_address, 'test-IP_ADDRESS');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.redirect, 'error');
      return Response.json({ status_cd: 'Sucess', data: { AuthToken: 'private-token' } });
    };
    assert.deepEqual(await authenticateWhitebooks(), { authToken: 'private-token' });
    const document = { Version: '1.1', DocDtls: { No: 'TEST/1' }, ItemList: [] };
    const irn = 'a'.repeat(64);
    globalThis.fetch = async (url, options) => {
      assert.equal(url.pathname, '/einvoice/type/GENERATE/version/V1_03');
      assert.equal(url.searchParams.get('email'), 'test+api@example.com');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['auth-token'], 'private-token');
      assert.equal(options.headers.password, undefined);
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(options.body), document);
      assert.equal(options.redirect, 'error');
      return Response.json({ status_cd: '1', data: { Irn: irn, AckNo: '123456', SignedQRCode: 'signed-qr', authToken: 'secret' }, headers: { password: 'secret' } });
    };
    assert.deepEqual(await generateWhitebooksIrn(document, 'private-token'), { Irn: irn, AckNo: '123456', SignedQRCode: 'signed-qr' });
    for (const body of [{ status_cd: '0', data: { Irn: irn, AckNo: '1' } }, { status_cd: '1', data: { Irn: 'invalid', AckNo: '1' } }]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(() => generateWhitebooksIrn(document, 'token'), /did not return a confirmed/);
    }
    let attempts = 0;
    globalThis.fetch = async () => { attempts++; throw new Error('sensitive timeout details'); };
    await assert.rejects(() => generateWhitebooksIrn(document, 'token'), /outcome is uncertain/);
    assert.equal(attempts, 1, 'generation must never automatically retry');
    for (const body of [{ status_cd: '0', data: { AuthToken: 'bad' } }, { status_cd: 'Sucess', data: {} }]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(authenticateWhitebooks, /did not return a valid/);
    }
    globalThis.fetch = async () => new Response('secret-provider-response', { status: 401 });
    globalThis.fetch = async () => Response.json({ status_cd: '0', status_desc: 'Incorrect user id/User does not exists' });
    await assert.rejects(authenticateWhitebooks, /rejected the API username/);
    globalThis.fetch = async () => new Response('secret-provider-response', { status: 401 });
    await assert.rejects(authenticateWhitebooks, /HTTP 401/);
    globalThis.fetch = async () => new Response('not-json');
    await assert.rejects(authenticateWhitebooks, /invalid response/);
    globalThis.fetch = async () => { throw new Error('secret-network-error'); };
    await assert.rejects(authenticateWhitebooks, /could not be reached/);
    delete process.env.WHITEBOOKS_PASSWORD;
    assert.equal(getWhitebooksConfigurationStatus().configured, false);
    await assert.rejects(authenticateWhitebooks, /password/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[`WHITEBOOKS_${key}`];
      else process.env[`WHITEBOOKS_${key}`] = value;
    }
  }
});
