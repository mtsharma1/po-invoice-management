import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const strip = source => source.replace(/^import .*;\r?$/gm, '');
const load = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
let state, fail, submission;
const reset = irn => {
  state = { header: { InvoiceID: 1, InvoiceNo: 'TEST/1', POBarcode: 'PO/1', IRN: irn },
    dispatch: [{ DID: 1, POID: 10, DispatchQty: 4 }, { DID: 2, POID: 11, DispatchQty: 7 }], archive: null };
  fail = false; submission = [];
};
globalThis.__cancelRun = async (sql, args) => {
  if (sql.startsWith('SELECT * FROM tblInvoiceHeader')) return [{ ...state.header }];
  if (sql.startsWith('SELECT InvoiceID FROM tblInvoiceHeader')) return [{ InvoiceID: 1 }];
  if (sql.startsWith('SELECT PO')) return [];
  if (sql.startsWith('SELECT State')) return submission;
  if (sql.startsWith('SELECT * FROM tblDispatch')) return structuredClone(state.dispatch);
  if (sql.startsWith('INSERT INTO webInvoiceCancellations')) { state.archive = args; return {}; }
  if (sql.startsWith('DELETE FROM tblDispatch')) { state.dispatch = []; return {}; }
  if (sql.startsWith('UPDATE tblInvoiceHeader')) {
    if (fail) throw new Error('simulated write failure');
    state.header.CancelledAt = '2026-11-24 13:00:00'; return {};
  }
  throw new Error('Unexpected query: ' + sql);
};
globalThis.__cancelTx = async work => {
  const before = structuredClone(state);
  try { return await work(globalThis.__cancelRun); }
  catch (error) { state = before; throw error; }
};
globalThis.__cancelSnapshot = () => ({ header: { ...state.header }, lines: structuredClone(state.dispatch), totals: { totalQty: 11 } });
const { cancelCustomerInvoice } = await load(`
const ensureInvoiceCancellationSchema = async () => {};
const withTransaction = work => globalThis.__cancelTx(work);
const getInvoice = async () => globalThis.__cancelSnapshot();
${strip(await readFile('src/lib/invoiceCancellation.js', 'utf8'))}`);
for (const irn of ['', 'a'.repeat(64)]) {
  reset(irn);
  await cancelCustomerInvoice(1, 'tester');
  assert.equal(state.dispatch.length, 0, 'both SKU quantities released');
  assert.equal(state.header.IRN, irn, 'registration history retained');
  assert.equal(JSON.parse(state.archive[2]).totals.totalQty, 11);
  assert.equal(JSON.parse(state.archive[3])[1].DispatchQty, 7);
  assert.equal(state.archive[4], 'tester');
  await assert.rejects(cancelCustomerInvoice(1, 'tester'), /already cancelled/);
}
reset(''); fail = true;
await assert.rejects(cancelCustomerInvoice(1, 'tester'), /simulated/);
assert.equal(state.dispatch.length, 2, 'rollback restores quantities');
assert.equal(state.archive, null);
assert.equal(state.header.CancelledAt, undefined);
for (const pending of ['pending', 'uncertain', 'generated']) {
  reset(''); submission = [{ State: pending }];
  await assert.rejects(cancelCustomerInvoice(1, 'tester'), /pending IRN/);
  assert.equal(state.dispatch.length, 2);
}
await assert.rejects(cancelCustomerInvoice(0, 'tester'), /valid invoice/);
const customer = await load(`
const ensureInvoiceCancellationSchema = async () => {};
const ensureInvoiceTaxVersionColumn = async () => {};
const ensureInvoicePresentationColumns = async () => {};
const ensureInvoiceTransportationColumn = async () => {};
const withTransaction = work => work(async () => [{ CancelledAt: '2026-11-24' }]);
${strip(await readFile('src/lib/customerInvoice.js', 'utf8'))}`);
await assert.rejects(customer.saveCustomerInvoice({ InvoiceID: 1, InvoiceNo: 'TEST/1' }), /cannot be edited/);
console.log('Passed cancellation with/without IRN, multiple SKU release, history, duplicate protection, rollback, pending submission safeguards and backend edit lock. Database/provider operations mocked.');
