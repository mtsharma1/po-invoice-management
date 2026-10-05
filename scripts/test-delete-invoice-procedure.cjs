// Integration checks against session-local temporary copies only.
// The installed procedure resolves these copies in the same connection.
// No real invoice rows are read, inserted, or deleted.
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
require('@next/env').loadEnvConfig(process.cwd());

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
  });
  const tables = [
    'tblInvoiceHeader', 'tblDispatch', 'tblDispatchHeader', 'webTmpDispatch',
    'webWhitebooksProductionEwayBill', 'webWhitebooksStandaloneEwayBill',
    'webWhitebooksSandboxEwayBill', 'webWhitebooksProductionIrn',
    'webWhitebooksSandboxIrn', 'webInvoiceEwayBillTransport',
  ];
  const run = async (sql, values = []) => {
    try { return (await connection.query(sql, values))[0]; }
    catch (error) { error.message = `${sql}: ${error.message}`; throw error; }
  };
  try {
    // All shadows must be successfully created and verified before any test writes.
    for (const table of tables) {
      const original = (await run(`SHOW CREATE TABLE \`${table}\``))[0]['Create Table'];
      const temporary = original.replace(/^CREATE TABLE/, 'CREATE TEMPORARY TABLE')
        .split('\n').filter(line => !/\bFOREIGN KEY\b/.test(line)).join('\n')
        .replace(/,\n\)/g, '\n)');
      await run(temporary);
      const definition = await run(`SHOW CREATE TABLE \`${table}\``);
      assert.match(definition[0]['Create Table'], /^CREATE TEMPORARY TABLE/);
    }
    for (const [id, invoice] of [[9001, 'TEST-DELETE'], [9002, 'TEST-KEEP']]) {
      await run('INSERT INTO tblInvoiceHeader (InvoiceID, InvoiceNo) VALUES (?, ?)', [id, invoice]);
      for (const table of ['webWhitebooksProductionEwayBill', 'webWhitebooksStandaloneEwayBill', 'webWhitebooksSandboxIrn']) {
        await run(`INSERT INTO ${table} (InvoiceNo, DocumentKey, State, RequestJson) VALUES (?, ?, 'succeeded', '{}')`, [invoice, String(id).padStart(64, '0')]);
      }
      await run("INSERT INTO webWhitebooksProductionIrn (InvoiceNo, DocumentKey, InvoiceID, State, RequestJson) VALUES (?, ?, ?, 'succeeded', '{}')", [invoice, String(id).padStart(64, '0'), id]);
      await run("INSERT INTO webWhitebooksSandboxEwayBill (InvoiceNo, Irn, State, RequestJson) VALUES (?, ?, 'succeeded', '{}')", [invoice, String(id).padStart(64, '0')]);
      await run("INSERT INTO webInvoiceEwayBillTransport (InvoiceNo, TransportJson) VALUES (?, '{}')", [invoice]);
    }
    await run("INSERT INTO tblDispatchHeader (DispatchNo) VALUES ('D1'), ('D2'), ('D3')");
    await run("INSERT INTO tblDispatch (POID, POBarcode, InvoiceNo, DispatchNo) VALUES (1,'SYNTHETIC','TEST-DELETE','D1'), (1,'SYNTHETIC','TEST-DELETE','D2'), (1,'SYNTHETIC','TEST-KEEP','D2'), (1,'SYNTHETIC','TEST-KEEP','D3')");
    await run("INSERT INTO webTmpDispatch (SessionId, InvoiceNo, DispatchNo) VALUES ('synthetic','TEST-DELETE','D1'), ('synthetic',NULL,'D1'), ('synthetic','TEST-KEEP','D2')");
    const counts = async () => {
      const result = {};
      for (const table of tables) result[table] = (await run(`SELECT COUNT(*) AS n FROM ${table}`))[0].n;
      return result;
    };
    const before = await counts();
    const preview = await run("CALL sp_delete_invoice_everywhere('TEST-DELETE', 0)");
    assert.equal(preview[0][0].Result, 'DRY RUN - ROLLED BACK');
    assert.equal(preview[0].find(row => row.TableName === 'tblInvoiceHeader').AffectedRows, 1);
    assert.equal(preview[0].find(row => row.TableName === 'tblDispatchHeader').AffectedRows, 1);
    assert.deepEqual(await counts(), before);
    await assert.rejects(run("CALL sp_delete_invoice_everywhere('', 1)"), /non-empty invoice/);
    await assert.rejects(run("CALL sp_delete_invoice_everywhere('TEST-DELETE', NULL)"), /p_delete/);
    await assert.rejects(run("CALL sp_delete_invoice_everywhere('TEST-DELETE', 2)"), /p_delete/);
    const deleted = await run("CALL sp_delete_invoice_everywhere('TEST-DELETE', 1)");
    assert.equal(deleted[0][0].Result, 'DELETED');
    for (const table of tables.filter(table => table !== 'tblDispatchHeader')) {
      assert.equal((await run(`SELECT COUNT(*) AS n FROM ${table} WHERE InvoiceNo = 'TEST-DELETE'`))[0].n, 0);
      assert.ok((await run(`SELECT COUNT(*) AS n FROM ${table} WHERE InvoiceNo = 'TEST-KEEP'`))[0].n > 0);
    }
    assert.deepEqual((await run('SELECT DispatchNo FROM tblDispatchHeader ORDER BY DispatchNo')).map(row => row.DispatchNo), ['D2', 'D3']);
    assert.equal((await run('SELECT COUNT(*) AS n FROM webTmpDispatch WHERE InvoiceNo IS NULL'))[0].n, 0);
    const repeated = await run("CALL sp_delete_invoice_everywhere('TEST-DELETE', 1)");
    assert.ok(repeated[0].every(row => row.AffectedRows === 0));

    // Force a mid-procedure failure after log deletions, still using a shadow.
    await run('DROP TEMPORARY TABLE webInvoiceEwayBillTransport');
    await run('CREATE TEMPORARY TABLE webInvoiceEwayBillTransport (InvalidColumn INT) ENGINE=InnoDB');
    const beforeFailure = await counts();
    await assert.rejects(run("CALL sp_delete_invoice_everywhere('TEST-KEEP', 1)"), /Unknown column/);
    assert.deepEqual(await counts(), beforeFailure);
    console.log('Passed: dry-run rollback, committed deletion, shared dispatch preservation, unrelated invoice preservation, invalid input, repeat calls, and rollback on error. Only temporary synthetic records were used.');
  } finally {
    await connection.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
