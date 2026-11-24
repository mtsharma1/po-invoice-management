// Session-local temporary tables shadow real tables. No application rows are changed.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
require('@next/env').loadEnvConfig(process.cwd());

(async () => {
  const connection = await require('mysql2/promise').createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });
  try {
    const run = async (sql, args = []) => (await connection.query(sql, args))[0];
    for (const [name, fields] of [
      ['tblInvoiceHeader', 'InvoiceID BIGINT PRIMARY KEY, InvoiceNo VARCHAR(255), POBarcode VARCHAR(255), IRN VARCHAR(255), CancelledAt DATETIME NULL'],
      ['tblPOHeaders', 'POBarcode VARCHAR(255) PRIMARY KEY'],
      ['tblPODetails', 'POID BIGINT PRIMARY KEY, POBarcode VARCHAR(255), Quantity INT'],
      ['tblDispatch', 'DID BIGINT PRIMARY KEY, InvoiceNo VARCHAR(255), POID BIGINT, DispatchQty INT'],
      ['webInvoiceCancellations', 'InvoiceID BIGINT PRIMARY KEY, InvoiceNo VARCHAR(255), SnapshotJson LONGTEXT, DispatchJson LONGTEXT, CancelledBy VARCHAR(255)'],
      ['webWhitebooksProductionIrn', 'InvoiceNo VARCHAR(255), State VARCHAR(20)'],
      ['webWhitebooksSandboxIrn', 'InvoiceNo VARCHAR(255), State VARCHAR(20)'],
    ]) await run(`CREATE TEMPORARY TABLE ${name} (${fields}) ENGINE=InnoDB`);
    await run("INSERT INTO tblPOHeaders VALUES ('PO/TEST')");
    await run("INSERT INTO tblPODetails VALUES (1, 'PO/TEST', 20), (2, 'PO/TEST', 15)");
    await run("INSERT INTO tblInvoiceHeader VALUES (1, 'CANCEL/TEST', 'PO/TEST', ?, NULL)", ['a'.repeat(64)]);
    await run("INSERT INTO tblDispatch VALUES (1, 'CANCEL/TEST', 1, 4), (2, 'CANCEL/TEST', 2, 7), (3, 'OTHER', 1, 3)");
    globalThis.__cancelDbTx = async work => {
      await connection.beginTransaction();
      try { const result = await work(run); await connection.commit(); return result; }
      catch (error) { await connection.rollback(); throw error; }
    };
    const source = (await fs.readFile('src/lib/invoiceCancellation.js', 'utf8')).replace(/^import .*;\r?$/gm, '');
    const api = await import('data:text/javascript;base64,' + Buffer.from(`
      const ensureInvoiceCancellationSchema = async () => {};
      const withTransaction = work => globalThis.__cancelDbTx(work);
      const getInvoice = async (invoiceNo, run) => ({ header: (await run('SELECT * FROM tblInvoiceHeader WHERE InvoiceNo = ?', [invoiceNo]))[0], lines: await run('SELECT * FROM tblDispatch WHERE InvoiceNo = ?', [invoiceNo]), totals: { totalQty: 11 } });
      ${source}`).toString('base64'));
    const available = () => run('SELECT p.POID, p.Quantity - COALESCE((SELECT SUM(d.DispatchQty) FROM tblDispatch d WHERE d.POID = p.POID), 0) AS Available FROM tblPODetails p ORDER BY p.POID');
    assert.deepEqual((await available()).map(row => Number(row.Available)), [13, 8]);
    await api.cancelCustomerInvoice(1, 'test-user');
    assert.deepEqual((await available()).map(row => Number(row.Available)), [17, 15]);
    assert.equal((await run('SELECT * FROM tblDispatch')).length, 1, 'other invoice remains untouched');
    const [archive] = await run('SELECT * FROM webInvoiceCancellations');
    assert.equal(JSON.parse(archive.DispatchJson).length, 2);
    assert.equal(JSON.parse(archive.SnapshotJson).header.IRN, 'a'.repeat(64));
    await assert.rejects(api.cancelCustomerInvoice(1, 'test-user'), /already cancelled/);
    await run('ALTER TABLE tblInvoiceHeader ADD InvoiceDate DATETIME NULL, ADD GSTN VARCHAR(255), ADD OrderNumber VARCHAR(255), ADD OrderDate DATETIME, ADD ConsigneeName VARCHAR(255), ADD DeliveredToName VARCHAR(255)');
    await run('ALTER TABLE tblPODetails ADD ListPriceFOBTransportExcise DECIMAL(18,2)');
    await run('CREATE TEMPORARY TABLE vwDispatchDetails (InvoiceNo VARCHAR(255), POID BIGINT, DispatchNo VARCHAR(255), DispatchQty INT)');
    // MySQL temporary tables cannot be reopened in a self-join; mirror the derived-table source.
    await run('CREATE TEMPORARY TABLE tblInvoiceHeaderPick AS SELECT * FROM tblInvoiceHeader');
    globalThis.__cancelDbRun = (sql, args) => run(sql.replace(/FROM tblInvoiceHeader(\s+WHERE)/g, 'FROM tblInvoiceHeaderPick$1'), args);
    const readerSource = (await fs.readFile('src/lib/invoices.js', 'utf8')).replace(/^import .*;\r?$/gm, '');
    const reader = await import('data:text/javascript;base64,' + Buffer.from(`
      const query = (...args) => globalThis.__cancelDbRun(...args);
      const ensureInvoiceCancellationSchema = async () => {};
      ${readerSource}`).toString('base64'));
    assert.equal(Number((await reader.listInvoices(10))[0].totalQty), 11, 'report retains archived quantity');
    const archived = await reader.getInvoice('CANCEL/TEST');
    assert.equal(archived.lines.length, 2);
    assert.ok(archived.header.CancelledAt);
    console.log('Passed MySQL cancellation transaction, availability per SKU, preserved IRN/archive, unrelated invoice preservation and repeat protection using temporary tables only.');
  } finally { await connection.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
