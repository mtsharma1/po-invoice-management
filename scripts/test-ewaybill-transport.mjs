import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const records = new Map();
globalThis.__transportQuery = async (sql, args) => {
  if (sql.startsWith('CREATE')) return [];
  if (sql.includes('FROM tblInvoiceHeader')) return args[0] === 'MISSING' ? [] : [{ InvoiceNo: args[0] }];
  if (sql.startsWith('INSERT')) { records.set(args[0], args[1]); return { affectedRows: 1 }; }
  if (sql.startsWith('SELECT TransportJson')) return records.has(args[0]) ? [{ TransportJson: records.get(args[0]) }] : [];
  throw new Error('Unexpected SQL');
};
const source = (await readFile('src/lib/ewayBillTransport.js', 'utf8')).replace(/^import .*;$/gm, '');
const api = await import('data:text/javascript;base64,' + Buffer.from('const query = globalThis.__transportQuery; class WhitebooksError extends Error {}\n' + source).toString('base64'));
try {
  assert.equal(await api.getEwayBillTransport('A'), null);
  await api.saveEwayBillTransport('A', { VehNo: 'KA12ER1234', Distance: 100, TransMode: '1', injected: 'ignored' });
  await api.saveEwayBillTransport('B', { VehNo: 'DL12AB1234', Distance: '' });
  assert.equal((await api.getEwayBillTransport('A')).VehNo, 'KA12ER1234');
  assert.equal((await api.getEwayBillTransport('B')).Distance, '');
  assert.equal((await api.getEwayBillTransport('A')).injected, undefined);
  await api.saveEwayBillTransport('A', { VehNo: 'KA12ER4321' });
  assert.equal((await api.getEwayBillTransport('A')).VehNo, 'KA12ER4321');
  assert.equal((await api.getEwayBillTransport('B')).VehNo, 'DL12AB1234');
  await assert.rejects(api.saveEwayBillTransport('MISSING', {}), /unique invoice/);
  assert.throws(() => api.normalizeTransport({ VehNo: {} }), /invalid value/);
  console.log('Transport save, reload, update, invoice isolation and invalid input checks passed.');
} finally { delete globalThis.__transportQuery; }
