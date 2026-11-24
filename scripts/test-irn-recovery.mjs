import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const api = await load(await readFile('src/lib/whitebooks.js', 'utf8'));
for (const key of ['EMAIL', 'USERNAME', 'PASSWORD', 'IP_ADDRESS', 'CLIENT_ID', 'CLIENT_SECRET', 'GSTIN']) process.env['WHITEBOOKS_PRODUCTION_' + key] = 'synthetic-' + key;
const document = { SellerDtls: { Gstin: 'synthetic-GSTIN' }, DocDtls: { Typ: 'INV', No: 'TEST/1', Dt: '24/11/2026' }, ItemList: [] };
const signed = doc => 'header.' + Buffer.from(JSON.stringify({ data: JSON.stringify(doc) })).toString('base64url') + '.signature';
const result = { Irn: 'a'.repeat(64), AckNo: '123456789012345', AckDt: '2026-11-24 12:00:00', Status: 'ACT', SignedInvoice: signed(document) };
const auth = { authToken: 'synthetic-token', irp: 'NIC1' };
const originalFetch = globalThis.fetch;
try {
  const rejection = codes => ({ status_cd: '0', status_desc: JSON.stringify(codes.map(ErrorCode => ({ ErrorCode, ErrorMessage: 'secret-provider-text' }))) });
  globalThis.fetch = async () => Response.json(rejection(['2288']));
  await assert.rejects(api.generateWhitebooksIrn(document, auth.authToken, 'production'), error => error instanceof api.WhitebooksIrnRejection && error.message.includes('recipient GSTIN') && !error.message.includes('secret'));
  for (const codes of [['2150'], ['2148'], ['2278'], ['2295'], ['2288', '9999']]) {
    globalThis.fetch = async () => Response.json(rejection(codes));
    await assert.rejects(api.generateWhitebooksIrn(document, auth.authToken, 'production'), error => !(error instanceof api.WhitebooksIrnRejection));
  }
  globalThis.fetch = async () => { throw new Error('network'); };
  await assert.rejects(api.generateWhitebooksIrn(document, auth.authToken, 'production'), /uncertain/);
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(url.pathname, '/einvoice/type/GETIRNBYDOCDETAILS/version/V1_03');
    assert.equal(url.searchParams.get('param1'), 'INV');
    assert.equal(options.headers.docnum, 'TEST/1'); assert.equal(options.headers.docdate, '24/11/2026');
    assert.equal(options.headers['auth-token'], auth.authToken);
    return Response.json({ status_cd: '1', data: { ...result, password: 'excluded' } });
  };
  assert.deepEqual(await api.getWhitebooksIrnByDocument(document, auth), result);
  globalThis.fetch = async () => Response.json(rejection(['2148']));
  assert.equal(await api.getWhitebooksIrnByDocument(document, auth), null);
  for (const payload of [rejection(['2154']), { status_cd: '0' }, { status_cd: '1', data: {} }, { status_cd: '1', data: { ...result, Status: 'CNL' } }, { status_cd: '1', data: { ...result, SignedInvoice: signed({ ...document, DocDtls: { ...document.DocDtls, No: 'OTHER' } }) } }]) {
    globalThis.fetch = async () => Response.json(payload);
    await assert.rejects(api.getWhitebooksIrnByDocument(document, auth));
  }
} finally { globalThis.fetch = originalFetch; }

// Service tests use only in-memory records. No env files, databases or live API.
globalThis.fetch = async () => { throw new Error('Unexpected live call'); };
let record, failGeneration, failApply, lookup, generationCount, lookupCount, loseReservation, invalid;
const reset = () => {
  record = null; failGeneration = null; failApply = false; lookup = null; generationCount = lookupCount = 0; loseReservation = invalid = false;
};
const oldRecord = (State = 'uncertain', AgeSeconds = 600) => ({ InvoiceID: 1, State, RequestJson: JSON.stringify(document), ResultJson: null, UpdatedAt: '2026-11-24 12:00:00', AgeSeconds });
reset();
const query = async (sql, args) => {
  if (sql.startsWith('CREATE')) return [];
  if (sql.startsWith('SELECT')) return record ? [{ ...record }] : [];
  if (sql.startsWith('INSERT')) { assert.equal(record, null); record = oldRecord('pending', 0); return { affectedRows: 1 }; }
  if (sql.startsWith('UPDATE')) {
    if (sql.includes('SET DocumentKey')) {
      assert.match(sql, /State IN \('rejected', 'retryable'\)/);
      if (loseReservation) return { affectedRows: 0 };
      record.State = 'pending'; record.RequestJson = args[1]; return { affectedRows: 1 };
    }
    if (sql.includes('AND UpdatedAt = ?')) {
      assert.equal(args[5], record.RequestJson); assert.equal(args[6], record.UpdatedAt);
      if (loseReservation) return { affectedRows: 0 };
    }
    record.State = args[0];
    if (sql.includes('ResultJson = ?')) record.ResultJson = args[1];
    return { affectedRows: 1 };
  }
  throw new Error('Unexpected query: ' + sql);
};
globalThis.__irnRecovery = {
  query, withTransaction: fn => fn(query),
  getInvoice: async () => ({ header: { InvoiceID: 1, InvoiceNo: 'TEST/1', IRN: '' }, lines: [] }),
  prepareEInvoiceFromInvoice: () => ({ valid: !invalid, document, hasIrn: false }),
  quantityInvoiceHeader: async () => ({}), assertCurrentIrnQuantities: async () => {},
  ensureInvoiceTaxSnapshots: async () => {}, saveTaxCandidate: async () => {},
  saveProductionIrnFields: async () => { if (failApply) throw new Error('Mock save error'); record.State = 'succeeded'; },
  authenticateWhitebooks: async () => auth, getEInvoiceConfig: () => ({ values: { gstin: document.SellerDtls.Gstin } }),
  generateWhitebooksIrn: async () => { generationCount++; if (failGeneration) throw failGeneration; return result; },
  getWhitebooksIrnByDocument: async doc => { lookupCount++; assert.deepEqual(doc, document); if (lookup instanceof Error) throw lookup; return lookup; },
  WhitebooksError: api.WhitebooksError, WhitebooksIrnRejection: api.WhitebooksIrnRejection,
};
const source = (await readFile('src/lib/whitebooksProductionIrn.js', 'utf8')).replace(/^import .*;$/gm, '');
const service = await load(`import { createHash } from 'node:crypto';
const { ${Object.keys(globalThis.__irnRecovery).join(', ')} } = globalThis.__irnRecovery;
class InvoiceQuantityError extends Error {}
` + source);
const generate = () => service.generateProductionIrn('TEST/1', {});
const check = () => service.reconcileProductionIrn('TEST/1');
failGeneration = new api.WhitebooksIrnRejection('Invalid recipient GSTIN');
assert.equal((await generate()).state, 'rejected'); assert.equal(record.State, 'rejected');
failGeneration = null; assert.equal((await generate()).state, 'succeeded'); assert.equal(generationCount, 2);
reset(); invalid = true; assert.equal((await generate()).ok, false); assert.equal(record, null); assert.equal(generationCount, 0);
reset(); failGeneration = new Error('timeout'); await assert.rejects(generate); assert.equal(record.State, 'uncertain');
await assert.rejects(generate, /pending or uncertain/); assert.equal(generationCount, 1);
reset(); record = oldRecord(); assert.equal((await check()).state, 'retryable'); assert.equal(generationCount, 0);
assert.equal((await service.getProductionIrn('TEST/1')).state, 'retryable');
assert.equal((await generate()).state, 'succeeded');
reset(); record = oldRecord('pending', 30); await assert.rejects(check, /five minutes/); assert.equal(lookupCount, 0);
reset(); record = oldRecord('uncertain', 49 * 3600); await assert.rejects(check, /lookup window/); assert.equal(record.State, 'uncertain');
reset(); record = oldRecord(); lookup = new Error('lookup unavailable'); await assert.rejects(check); assert.equal(record.State, 'uncertain');
reset(); record = oldRecord(); lookup = result; assert.equal((await check()).state, 'succeeded'); assert.equal(generationCount, 0);
assert.equal(JSON.parse(record.ResultJson).Irn, result.Irn);
reset(); record = oldRecord(); lookup = result; failApply = true;
assert.equal((await check()).state, 'generated'); assert.equal(record.State, 'generated');
failApply = false; assert.equal((await generate()).state, 'succeeded'); assert.equal(generationCount, 0);
reset(); record = oldRecord(); loseReservation = true; await assert.rejects(check, /status changed/);
reset(); record = oldRecord('retryable'); loseReservation = true; await assert.rejects(generate, /status changed/); assert.equal(generationCount, 0);
delete globalThis.__irnRecovery; globalThis.fetch = originalFetch;
console.log('IRN rejection classification, safe errors, document lookup, retry, recovery, time windows, concurrent reservation and save recovery checks passed. No real submissions.');
