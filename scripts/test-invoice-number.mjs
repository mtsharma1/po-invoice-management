import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/lib/invoiceNumber.js', 'utf8');
const { renameInvoiceReferences } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const references = ['tblInvoiceHeader', 'tblDispatch', 'webTmpDispatch', 'customInvoiceLink', 'webInvoiceTaxSnapshots', 'webWhitebooksProductionIrn'];
let records;
let writes;
function reset() {
  records = new Map(references.map(table => [table, table.includes('Whitebooks') ? [] : ['OLD/1']]));
  writes = [];
}
async function run(sql, args = []) {
  if (sql.startsWith('SELECT InvoiceID')) return [{ InvoiceID: 1 }];
  if (sql.includes('information_schema')) return references.map(TABLE_NAME => ({
    TABLE_NAME, COLUMN_NAME: 'InvoiceNo', ENGINE: 'InnoDB', CHARACTER_MAXIMUM_LENGTH: 100,
  }));
  if (sql.startsWith('SELECT 1 FROM webInvoiceTaxSnapshots')) return [];
  const table = references.find(name => sql.includes('`' + name + '`'));
  if (sql.startsWith('SELECT 1')) {
    if (sql.includes('LOWER')) return (records.get(table) || []).includes(args[0]) ? [{}] : [];
    return records.get(table)?.includes(args[0]) ? [{}] : [];
  }
  writes.push(sql);
  if (sql.startsWith('DELETE FROM webInvoiceTaxSnapshots')) records.set('webInvoiceTaxSnapshots', []);
  else if (sql.startsWith('UPDATE')) records.set(table, records.get(table).map(value => value === args[1] ? args[0] : value));
  else throw new Error('Unexpected SQL ' + sql);
  return { affectedRows: 1 };
}

reset();
await renameInvoiceReferences(run, { InvoiceNo: 'OLD/1', IRN: '' }, 'NEW/2');
for (const table of ['tblDispatch', 'webTmpDispatch', 'customInvoiceLink']) assert.deepEqual(records.get(table), ['NEW/2']);
assert.deepEqual(records.get('webInvoiceTaxSnapshots'), []);
assert.deepEqual(records.get('tblInvoiceHeader'), ['OLD/1'], 'caller updates the header in the same transaction');

reset();
records.get('customInvoiceLink').push('NEW/2');
await assert.rejects(renameInvoiceReferences(run, { InvoiceNo: 'OLD/1' }, 'NEW/2'), /already used/);
assert.equal(writes.length, 0);
reset();
records.get('webWhitebooksProductionIrn').push('OLD/1');
await assert.rejects(renameInvoiceReferences(run, { InvoiceNo: 'OLD/1' }, 'NEW/2'), /locked/);
assert.equal(writes.length, 0);
await assert.rejects(renameInvoiceReferences(run, { InvoiceNo: 'OLD/1', IRN: 'a'.repeat(64) }, 'NEW/2'), /after IRN/);
await assert.rejects(renameInvoiceReferences(run, { InvoiceNo: 'OLD/1' }, 'BAD NUMBER'), /1–16/);
console.log('Passed invoice reference discovery, linked renaming, duplicate reference rejection, IRN lock and invoice number validation. Database operations mocked.');
