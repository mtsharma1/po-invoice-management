import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = async path => import('data:text/javascript;base64,' + Buffer.from(await readFile(path, 'utf8')).toString('base64'));
const { saveProductionIrnFields } = await load('src/lib/productionIrnSave.js');
const result = { Irn: 'a'.repeat(64), AckNo: 132628936888967, AckDt: '2026-09-22 15:39:00' };
for (const initial of [null, '', 'null', ' NULL ', 'undefined', ' ']) {
  let fields, completed = false;
  const run = async (sql, args) => {
    if (sql.startsWith('SELECT InvoiceID')) return [{ InvoiceID: 76 }];
    if (sql.startsWith('SELECT IRN')) return [{ IRN: initial, AckNo: null, AckDate: null }];
    if (sql.startsWith('UPDATE tblInvoiceHeader')) { fields = args; return { affectedRows: 1 }; }
    completed = true;
  };
  await saveProductionIrnFields(run, 'INS/26-27/1094', result);
  assert.deepEqual(fields, [result.Irn, String(result.AckNo), result.AckDt, 76, 'INS/26-27/1094']);
  assert.equal(completed, true);
}
let updated = false;
const existing = async sql => {
  if (sql.startsWith('SELECT InvoiceID')) return [{ InvoiceID: 76 }];
  if (sql.startsWith('SELECT IRN')) return [{ IRN: result.Irn, AckNo: String(result.AckNo), AckDate: result.AckDt }];
  if (sql.startsWith('UPDATE tblInvoiceHeader')) updated = true;
};
await saveProductionIrnFields(existing, 'INS/26-27/1094', result);
assert.equal(updated, false, 'Matching manually entered values must be preserved');
await assert.rejects(() => saveProductionIrnFields(async sql => sql.startsWith('SELECT InvoiceID') ? [{ InvoiceID: 76 }] : [{ IRN: 'b'.repeat(64) }], 'INS/26-27/1094', result), /different IRN/);
await assert.rejects(() => saveProductionIrnFields(existing, 'INS/26-27/1094', { ...result, AckDt: 'bad' }), /acknowledgement date/);
const { invoiceQrUrl } = await load('src/lib/invoiceQr.js');
assert.equal(invoiceQrUrl({ IRN: 'null', InvoiceNo: 'TEST' }), '/api/customer-invoice/qr?irn=TEST');
assert.equal(invoiceQrUrl({ IRN: result.Irn }), '/api/customer-invoice/qr?irn=' + result.Irn);
console.log('IRN null handling, automatic field saving, conflict protection, manual-value preservation and QR URL checks passed.');
