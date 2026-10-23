import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const helper = await readFile('src/lib/dispatchQuantity.js', 'utf8');
const { validateDispatchQuantity } = await import('data:text/javascript;base64,' + Buffer.from(helper).toString('base64'));
for (const value of [0, 19, 20, '20']) assert.equal(validateDispatchQuantity(value, 20), Number(value));
for (const value of [21, -1, 1.5, 'abc', Infinity]) assert.throws(() => validateDispatchQuantity(value, 20));
assert.throws(() => validateDispatchQuantity(1, 0), /available quantity/);
let updates = 0;
globalThis.__dispatchRun = async sql => {
 if (sql.includes('SELECT Quantity FROM webTmpDispatch')) return [{ Quantity: 20 }];
 if (sql.includes('UPDATE webTmpDispatch')) { updates++; return { affectedRows: 1 }; }
 throw new Error('Unexpected query: ' + sql);
};
const source = (await readFile('src/lib/dispatch.js', 'utf8')).replace(/^import .*;\r?$/gm, '');
const api = await import('data:text/javascript;base64,' + Buffer.from(`${helper.replace('export function', 'function')}
const query = globalThis.__dispatchRun;
const withTransaction = work => work(query);
${source}`).toString('base64'));
const args = { sessionId: 'mock', poBarcode: 'TEST', draftId: 1 };
await assert.rejects(api.updateDispatchDraftQty({...args, dispatchQty: 21}), /available quantity \(20\)/);
assert.equal(updates, 0, 'invalid quantity must not reach UPDATE');
await api.updateDispatchDraftQty({...args, dispatchQty: 20});
assert.equal(updates, 1);
delete globalThis.__dispatchRun;
console.log('Passed quantity boundaries, invalid numbers and API rejection before UPDATE. No database connection.');
