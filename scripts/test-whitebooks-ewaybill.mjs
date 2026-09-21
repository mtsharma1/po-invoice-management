import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const api = await load(await readFile('src/lib/whitebooks.js', 'utf8'));
const service = (await readFile('src/lib/whitebooksEwayBill.js', 'utf8')).replace(/^import .*;$/gm, '') + '\n';
const { prepareEwayBill, buildStandaloneEwayBill } = await load('class WhitebooksError extends Error {}\n' + service);
const irn = 'a'.repeat(64);
const transport = { Distance: '100', TransMode: '1', VehType: 'R', VehNo: 'ka12er1234' };
const body = prepareEwayBill(irn, transport);
assert.equal(body.VehNo, 'KA12ER1234');
assert.equal(body.Distance, 100);
assert.equal(body.Irn, irn);
assert.throws(() => prepareEwayBill('', transport), /saved sandbox IRN/);
assert.throws(() => prepareEwayBill(irn, { ...transport, Distance: -1 }), /Distance/);
assert.throws(() => prepareEwayBill(irn, { ...transport, TransMode: '2' }), /document number/);
assert.throws(() => prepareEwayBill(irn, { ...transport, TransDocDt: '31\/02\/2026' }), /valid DD/);
const originalFetch = globalThis.fetch;
const originalEmail = process.env.WHITEBOOKS_EMAIL;
try {
  process.env.WHITEBOOKS_EMAIL = 'test+eway@example.com';
  globalThis.fetch = async (url, options) => {
    assert.equal(url.pathname, '/einvoice/type/GENERATE_EWAYBILL/version/V1_03');
    assert.equal(url.searchParams.get('email'), 'test+eway@example.com');
    assert.equal(url.searchParams.get('irp'), 'NIC1');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['auth-token'], 'test-token');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), body);
    return Response.json({ status_cd: '1', data: { EwbNo: 123456789012, EwbDt: 'test date', EwbValidTill: 'test expiry', AuthToken: 'secret' } });
  };
  assert.deepEqual(await api.generateWhitebooksEwayBill(body, { authToken: 'test-token', irp: 'NIC1' }), { EwbNo: 123456789012, EwbDt: 'test date', EwbValidTill: 'test expiry' });
  await assert.rejects(() => api.generateWhitebooksEwayBill(body, { authToken: 'test-token' }), /IRP/);
  let attempts = 0;
  globalThis.fetch = async () => { attempts++; throw new Error('timeout'); };
  await assert.rejects(() => api.generateWhitebooksEwayBill(body, { authToken: 'token', irp: 'NIC1' }), /uncertain/);
  assert.equal(attempts, 1);
  globalThis.fetch = async () => Response.json({ status_cd: '0', data: { EwbNo: 123456789012 } });
  await assert.rejects(() => api.generateWhitebooksEwayBill(body, { authToken: 'token', irp: 'NIC1' }), /did not confirm/);
} finally {
  globalThis.fetch = originalFetch;
  if (originalEmail === undefined) delete process.env.WHITEBOOKS_EMAIL; else process.env.WHITEBOOKS_EMAIL = originalEmail;
}
const { canAccessPath } = await load(await readFile('src/lib/permissions.js', 'utf8'));
assert.equal(canAccessPath({ access: 8 }, '/api/whitebooks/ewaybill'), true);
assert.equal(canAccessPath({ access: 6 }, '/api/whitebooks/ewaybill'), false);
assert.equal(canAccessPath(null, '/api/whitebooks/ewaybill'), false);
console.log('E-way bill validation, API request, error handling and permission checks passed.');

const party = { Gstin: '29TEST0000000000', LglNm: 'Test', Addr1: 'Address', Loc: 'City', Pin: 560001, Stcd: '29' };
const invoice = { DocDtls: { Typ: 'INV', No: 'TEST/1', Dt: '16/09/2026' }, TranDtls: { SupTyp: 'B2B' }, SellerDtls: party, BuyerDtls: { ...party, Stcd: '06' }, ValDtls: { AssVal: 100, CgstVal: 0, SgstVal: 0, IgstVal: 18, CesVal: 0, TotInvVal: 118 }, ItemList: [{ PrdDesc: 'Goods', HsnCd: '9403', Qty: 1, Unit: 'NOS', AssAmt: 100, GstRt: 18, IgstAmt: 18, IsServc: 'N' }] };
const standalone = buildStandaloneEwayBill(invoice, transport);
assert.equal(standalone.transactionType, 1);
assert.equal(standalone.itemList[0].igstRate, 18);
assert.equal(standalone.Irn, undefined);
assert.equal(standalone.subSupplyDesc, undefined);
assert.equal(buildStandaloneEwayBill({ ...invoice, DispDtls: party }, transport).transactionType, 3);
assert.equal(buildStandaloneEwayBill({ ...invoice, ShipDtls: party }, transport).transactionType, 2);
assert.equal(buildStandaloneEwayBill({ ...invoice, DispDtls: party, ShipDtls: party }, transport).transactionType, 4);
const savedFetch = globalThis.fetch;
try {
  process.env.WHITEBOOKS_EMAIL = 'test@example.com';
  globalThis.fetch = async (url, options) => {
    assert.equal(url.pathname, '/ewaybillapi/v1.03/ewayapi/genewaybill');
    assert.equal(url.searchParams.get('irp'), 'NIC1');
    assert.equal(options.headers['auth-token'], undefined);
    assert.deepEqual(JSON.parse(options.body), standalone);
    return Response.json({ status_cd: '1', data: { ewayBillNo: 123456789012, ewayBillDate: 'date', validUpto: 'expiry' } });
  };
  assert.deepEqual(await api.generateStandaloneWhitebooksEwayBill(standalone, { irp: 'NIC1' }), { EwbNo: 123456789012, EwbDt: 'date', EwbValidTill: 'expiry' });
} finally { globalThis.fetch = savedFetch; }
console.log('Standalone invoice mapping, transaction types and generation endpoint checks passed.');
