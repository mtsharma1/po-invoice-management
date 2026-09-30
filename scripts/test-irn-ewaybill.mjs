import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = text => import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
// No environment files, database connections or live HTTP calls are used.
globalThis.fetch = async () => { throw new Error('Unexpected network call'); };
const api = await load(await readFile('src/lib/whitebooks.js', 'utf8'));
for (const key of ['EMAIL', 'USERNAME', 'PASSWORD', 'IP_ADDRESS', 'CLIENT_ID', 'CLIENT_SECRET', 'GSTIN']) {
  process.env['WHITEBOOKS_PRODUCTION_' + key] = 'invoice-' + key;
  process.env['WHITEBOOKS_EWAYBILL_PRODUCTION_' + key] = 'wrong-ewb-' + key;
}
globalThis.fetch = async (url, options) => {
  assert.equal(url.origin, 'https://api.whitebooks.in');
  assert.equal(options.headers.client_id, 'invoice-CLIENT_ID');
  assert.equal(options.headers.client_secret, 'invoice-CLIENT_SECRET');
  if (url.pathname.endsWith('/authenticate')) {
    assert.equal(options.method, 'GET');
    return Response.json({ status_cd: '1', irp: 'NIC1', data: { AuthToken: 'synthetic-token' } });
  }
  assert.equal(url.pathname, '/einvoice/type/GENERATE_EWAYBILL/version/V1_03');
  assert.equal(url.searchParams.get('irp'), 'NIC1');
  assert.equal(options.headers['auth-token'], 'synthetic-token');
  assert.equal(JSON.parse(options.body).Distance, 0);
  return Response.json({ status_cd: '1', data: { EwbNo: 123456789012, EwbDt: 'test', EwbValidTill: 'test', AuthToken: 'must-not-save' } });
};
const auth = await api.authenticateWhitebooks('production');
const output = await api.generateWhitebooksEwayBill({ Irn: 'a'.repeat(64), Distance: 0 }, auth, 'production');
assert.deepEqual(output, { EwbNo: 123456789012, EwbDt: 'test', EwbValidTill: 'test' });
globalThis.fetch = async () => { throw new Error('Timeout containing a secret'); };
await assert.rejects(api.generateWhitebooksEwayBill({}, auth, 'production'), /outcome is uncertain/);
globalThis.fetch = async () => Response.json({ status_cd: '0', status_desc: 'secret' });
await assert.rejects(api.generateWhitebooksEwayBill({}, auth, 'production'), /did not confirm/);
globalThis.fetch = async () => { throw new Error('Unexpected network call'); };

let record, source, header, counts, failSave, failGenerate, missingIrp, wrongGstin, providerResult, lookupFailure;
const result = { EwbNo: 123456789012, EwbDt: 'test', EwbValidTill: 'test' };
function reset() {
  providerResult = null; lookupFailure = false;
  record = null; source = { state: 'succeeded', result: { Irn: 'a'.repeat(64), Status: 'ACT' } };
  header = { InvoiceNo: 'SYNTHETIC/1', IRN: 'a'.repeat(64), GSTN: 'TESTGSTIN' };
  counts = { auth: 0, generate: 0 }; failSave = failGenerate = missingIrp = wrongGstin = false;
}
reset();
globalThis.__irnEwb = {
  query: async (sql, args) => {
    assert.match(sql, /webWhitebooksProductionEwayBill/);
    if (sql.startsWith('CREATE')) return [];
    if (sql.startsWith('SELECT')) return record ? [record] : [];
    if (sql.startsWith('INSERT')) {
      assert.equal(args[0], 'SYNTHETIC/1');
      const body = JSON.parse(args[3]);
      assert.equal(body.Irn, 'a'.repeat(64)); if (args[2] === 'pending') assert.equal(body.Distance, 0);
      assert.equal(body.SellerDtls, undefined);
      record = { State: args[2], ResultJson: args[4] || null }; return { affectedRows: 1 };
    }
    if (sql.startsWith('UPDATE')) {
      if (args[0] === 'succeeded' && failSave) return { affectedRows: 0 };
      record.State = args[0]; if (args[0] === 'succeeded') record.ResultJson = args[1];
      return { affectedRows: 1 };
    }
    throw new Error('Unexpected SQL');
  },
  getWhitebooksEwayBillByIrn: async (irn) => { assert.equal(irn, 'a'.repeat(64)); if (lookupFailure) throw new Error('Lookup unavailable'); return providerResult; },
  getInvoice: async () => ({ header }),
  getProductionIrn: async () => source,
  getEInvoiceConfig: () => ({ values: { gstin: wrongGstin ? 'OTHER' : 'TESTGSTIN' } }),
  authenticateWhitebooks: async env => { assert.equal(env, 'production'); counts.auth++; return { authToken: 'token', ...(missingIrp ? {} : { irp: 'NIC1' }) }; },
  generateWhitebooksEwayBill: async (doc, authentication, env) => {
    assert.equal(env, 'production'); assert.equal(doc.Irn, 'a'.repeat(64)); counts.generate++;
    if (failGenerate) throw new Error('Mock uncertain outcome'); return result;
  },
};
const sourceText = (await readFile('src/lib/whitebooksEwayBill.js', 'utf8')).replace(/^import .*;$/gm, '');
const service = await load(`import { createHash } from 'node:crypto';
const { query, getInvoice, getProductionIrn, getEInvoiceConfig, authenticateWhitebooks, generateWhitebooksEwayBill, getWhitebooksEwayBillByIrn } = globalThis.__irnEwb;
class WhitebooksError extends Error {}
const getEwayBillEnvironment = () => 'production';
const forbidden = () => { throw new Error('Wrong path: standalone, editable invoice or sandbox accessed'); };
const prepareEInvoice = forbidden, getSandboxIrn = forbidden, getEwayBillConfig = forbidden,
authenticateWhitebooksEwayBill = forbidden, generateStandaloneWhitebooksEwayBill = forbidden;
` + sourceText);
const transport = { Distance: '0', TransMode: '1', VehType: 'R', VehNo: 'KA12ER1234' };
const generate = () => service.generateEwayBill('SYNTHETIC/1', transport, { irn: 'b'.repeat(64) });
assert.equal((await generate()).state, 'succeeded');
assert.equal((await service.getEwayBill('SYNTHETIC/1')).result.EwbNo, result.EwbNo);
await generate(); assert.equal(counts.generate, 1, 'Reload must not generate another bill');
reset(); source.result.EwbNo = result.EwbNo; await generate(); assert.equal(counts.generate, 0, 'Combined bill must be reused');
reset(); source = null; assert.equal((await generate()).state, 'succeeded', 'Manually saved IRN supported');
reset(); header.IRN = 'b'.repeat(64); await assert.rejects(generate, /conflicts/); assert.equal(counts.auth, 0);
reset(); source.result.Status = 'CNL'; await assert.rejects(generate, /not active/);
reset(); source = null; header.IRN = ''; await assert.rejects(generate, /IRN first/);
reset(); source = { state: 'pending' }; await assert.rejects(generate, /pending or uncertain/);
reset(); wrongGstin = true; await assert.rejects(generate, /GSTIN/); assert.equal(counts.auth, 0);
reset(); missingIrp = true; await assert.rejects(generate, /identify the IRP/); assert.equal(record, null);
reset(); await assert.rejects(service.generateEwayBill('SYNTHETIC/1', { ...transport, VehNo: '' }, {}), /vehicle number/); assert.equal(counts.generate, 0);
reset(); failGenerate = true; await assert.rejects(generate, /uncertain/); assert.equal(record.State, 'uncertain');
await assert.rejects(generate, /pending or uncertain/); assert.equal(counts.generate, 1);
reset(); failSave = true; const unsaved = await generate(); assert.equal(unsaved.state, 'uncertain'); assert.deepEqual(unsaved.result, result);
await assert.rejects(generate, /pending or uncertain/); assert.equal(counts.generate, 1);
reset(); providerResult = result; record = { State: 'uncertain', ResultJson: null };
assert.equal((await service.reconcileEwayBill('SYNTHETIC/1', 'production', String(result.EwbNo))).state, 'succeeded');
assert.equal(counts.generate, 0, 'Recovery must never generate');
assert.equal((await service.getEwayBill('SYNTHETIC/1')).result.EwbNo, result.EwbNo);
reset(); providerResult = result; record = { State: 'uncertain', ResultJson: null }; failSave = true;
await assert.rejects(service.reconcileEwayBill('SYNTHETIC/1', 'production', String(result.EwbNo)), /saving failed/);
assert.equal(record.State, 'uncertain'); assert.equal(counts.generate, 0);
reset(); providerResult = result;
const preview = await generate();
assert.equal(preview.requiresConfirmation, true); assert.deepEqual(preview.result, result);
assert.equal(record, null, 'Existing bill must not be saved before consent'); assert.equal(counts.generate, 0);
assert.equal((await service.reconcileEwayBill('SYNTHETIC/1')).requiresConfirmation, true);
assert.equal(record, null, 'Status check must not save');
await assert.rejects(service.reconcileEwayBill('SYNTHETIC/1', 'production', '999999999999'), /changed/);
assert.equal(record, null);
assert.equal((await service.reconcileEwayBill('SYNTHETIC/1', 'production', String(result.EwbNo))).state, 'succeeded');
assert.equal(JSON.parse(record.ResultJson).EwbNo, result.EwbNo); assert.equal(counts.generate, 0);
reset(); lookupFailure = true; await assert.rejects(generate, /Lookup unavailable/); assert.equal(record, null); assert.equal(counts.generate, 0);
reset(); assert.equal((await service.reconcileEwayBill('SYNTHETIC/1')).state, 'not_found'); assert.equal(record, null);
globalThis.fetch = async (url, options) => {
  assert.equal(options.method, 'GET');
  assert.equal(url.pathname, '/einvoice/type/GETIRN/version/V1_03');
  assert.equal(url.searchParams.get('param1'), 'a'.repeat(64));
  return Response.json({ status_cd: '1', data: { Irn: 'a'.repeat(64), Status: 'ACT', ...result, SignedInvoice: 'private' } });
};
assert.deepEqual(await api.getWhitebooksEwayBillByIrn('a'.repeat(64), auth), result);
for (const data of [{ Irn: 'b'.repeat(64), Status: 'ACT', ...result }, { Irn: 'a'.repeat(64), Status: 'ACT' }, { Irn: 'a'.repeat(64), Status: 'CNL', ...result }]) {
  globalThis.fetch = async () => Response.json({ status_cd: '1', data });
  await assert.rejects(api.getWhitebooksEwayBillByIrn('a'.repeat(64), auth), /did not confirm/);
}
globalThis.fetch = async () => Response.json({ status_cd: '1', data: { Irn: 'a'.repeat(64), Status: 'ACT', EwbNo: null } });
assert.equal(await api.getWhitebooksEwayBillByIrn('a'.repeat(64), auth, 'production', { allowMissing: true }), null);
globalThis.fetch = async () => Response.json({ status_cd: '0', data: { Irn: 'a'.repeat(64), Status: 'ACT', EwbNo: null } });
await assert.rejects(api.getWhitebooksEwayBillByIrn('a'.repeat(64), auth, 'production', { allowMissing: true }), /did not confirm/);
console.log('Read-only recovery, saved-result reload, wrong-IRN rejection and save-failure checks passed.');
delete globalThis.__irnEwb;
console.log('IRN e-way bill authentication, routing, automatic distance, persistence, reload, conflicts, cancellation and uncertain-outcome checks passed.');
