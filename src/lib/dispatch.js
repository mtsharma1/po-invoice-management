import ExcelJS from 'exceljs';
import { query, withTransaction } from './db';
import { getShellOrderContext, listPOBarcodes } from './shellOrders';

export async function listDispatchRows(limit = 200) {
  return query(
    `SELECT
       DID,
       POID,
       POBarcode,
       StyleId,
       HSNCode,
       VendorArticleName,
       Size,
       Colour,
       MRP,
       Quantity,
       DispatchQty,
       PendingQuantity,
       DispatchDate,
       DispatchNo,
       InvoiceNo
     FROM vwDispatchDetails
     ORDER BY COALESCE(DispatchDate, '1900-01-01') DESC, DID DESC
     LIMIT ?`,
    [Number(limit)]
  );
}

export async function getDispatchScreenData({ poBarcode = '', sessionId, mode = 'selected' } = {}) {
  await ensureWebDispatchTables();

  if (poBarcode && mode === 'selected') {
    await prepareDispatchSelection(poBarcode, sessionId);
  }

  const [poOptions, poContext, rows] = await Promise.all([
    listPOBarcodes(),
    getShellOrderContext(poBarcode),
    poBarcode
      ? mode === 'view'
        ? listDispatchViewRows(poBarcode)
        : listDispatchEditRows(sessionId, poBarcode)
      : Promise.resolve([]),
  ]);

  return { poOptions, poContext, rows, mode };
}

export async function prepareDispatchSelection(poBarcode, sessionId) {
  if (!poBarcode) return { message: 'Please select PO Number.' };

  return withTransaction(async (run) => {
    await ensureWebDispatchTables(run);
    await run('DELETE FROM webTmpDispatch WHERE SessionId = ?', [sessionId]);

    await run(
      `INSERT INTO webTmpDispatch
         (SessionId, POID, DispatchQty, POBarcode, DispatchDate, DispatchNo, InvoiceNo)
       SELECT ?, POID, DispatchQty, POBarcode, DispatchDate, DispatchNo, InvoiceNo
       FROM tblDispatch
       WHERE POBarcode = ?`,
      [sessionId, poBarcode]
    );

    await run(
      `UPDATE webTmpDispatch tmp
       INNER JOIN vwPoDetails pod ON pod.POID = tmp.POID
       SET tmp.Quantity = COALESCE(pod.Quantity, 0)
       WHERE tmp.SessionId = ?
         AND tmp.POBarcode = ?`,
      [sessionId, poBarcode]
    );

    return { message: 'Dispatch rows loaded.' };
  });
}

export async function createDispatchDraft(poBarcode, sessionId, { view = false } = {}) {
  if (!poBarcode) throw new Error('Please select PO Number before creating dispatch.');

  return withTransaction(async (run) => {
    await ensureWebDispatchTables(run);
    await run('DELETE FROM webTmpDispatch WHERE SessionId = ?', [sessionId]);

    await run(
      `INSERT INTO webTmpDispatch (SessionId, POBarcode, POID, DispatchQty)
       SELECT ?, POBarcode, POID, SUM(COALESCE(DispatchQty, 0)) AS DispatchQty
       FROM tblDispatch
       WHERE POBarcode = ?
       GROUP BY POBarcode, POID`,
      [sessionId, poBarcode]
    );

    if (view) {
      await run(
        `INSERT INTO webTmpDispatch (SessionId, POBarcode, POID, Quantity)
         SELECT ?, pod.POBarcode, pod.POID, pod.Quantity
         FROM tblPODetails pod
         WHERE pod.POBarcode = ?
           AND NOT EXISTS (
             SELECT 1
             FROM tblDispatch disp
             WHERE disp.POBarcode = pod.POBarcode
               AND disp.POID = pod.POID
           )`,
        [sessionId, poBarcode]
      );

      await run(
        `UPDATE webTmpDispatch tmp
         INNER JOIN vwPoDetails pod ON pod.POID = tmp.POID
         SET tmp.Quantity = COALESCE(pod.Quantity, 0)
         WHERE tmp.SessionId = ?
           AND tmp.POBarcode = ?`,
        [sessionId, poBarcode]
      );

      await run(
        `UPDATE webTmpDispatch tmp
         INNER JOIN (
           SELECT
             POID,
             POBarcode,
             MAX(DispatchDate) AS DispatchDate,
             MAX(DispatchNo) AS DispatchNo
           FROM tblDispatch
           WHERE POBarcode = ?
           GROUP BY POID, POBarcode
         ) disp ON disp.POID = tmp.POID AND disp.POBarcode = tmp.POBarcode
         SET tmp.DispatchDate = disp.DispatchDate,
             tmp.DispatchNo = disp.DispatchNo
         WHERE tmp.SessionId = ?`,
        [poBarcode, sessionId]
      );

      return { message: 'Dispatch view loaded.' };
    }

    await run(
      `INSERT INTO webTmpDispatch (SessionId, POBarcode, POID)
       SELECT ?, pod.POBarcode, pod.POID
       FROM vwPoDetails pod
       WHERE pod.POBarcode = ?
         AND NOT EXISTS (
           SELECT 1
           FROM webTmpDispatch tmp
           WHERE tmp.SessionId = ?
             AND tmp.POBarcode = pod.POBarcode
             AND tmp.POID = pod.POID
         )`,
      [sessionId, poBarcode, sessionId]
    );

    await run(
      `UPDATE webTmpDispatch tmp
       INNER JOIN vwPoDetails pod ON pod.POID = tmp.POID
       SET tmp.Quantity = GREATEST(COALESCE(pod.Quantity, 0) - COALESCE(tmp.DispatchQty, 0), 0)
       WHERE tmp.SessionId = ?
         AND tmp.POBarcode = ?`,
      [sessionId, poBarcode]
    );

    await run(
      `DELETE FROM webTmpDispatch
       WHERE SessionId = ?
         AND POBarcode = ?
         AND COALESCE(Quantity, 0) = 0`,
      [sessionId, poBarcode]
    );

    await run(
      `UPDATE webTmpDispatch
       SET DispatchQty = 0,
           DispatchDate = NULL,
           DispatchNo = NULL,
           InvoiceNo = NULL
       WHERE SessionId = ?
         AND POBarcode = ?`,
      [sessionId, poBarcode]
    );

    const countRows = await run(
      `SELECT COUNT(*) AS rowCount
       FROM webTmpDispatch
       WHERE SessionId = ?
         AND POBarcode = ?`,
      [sessionId, poBarcode]
    );

    return {
      rowCount: Number(countRows[0]?.rowCount || 0),
      message: 'Dispatch draft created. Enter Dispatch Qty and POST when ready.',
    };
  });
}

export async function listDispatchEditRows(sessionId, poBarcode) {
  return query(
    `SELECT
       tmp.WTDID,
       tmp.POID,
       tmp.DispatchQty,
       tmp.TrollySize,
       tmp.AppointmentDate,
       tmp.POBarcode,
       tmp.CreatedOn,
       tmp.DispatchDate,
       tmp.AvailableQuantity,
       tmp.Quantity,
       COALESCE(tmp.Quantity, 0) - COALESCE(tmp.DispatchQty, 0) AS PendingQuantity,
       tmp.DispatchNo,
       tmp.InvoiceNo,
       pod.HSNCode,
       pod.VendorArticleName,
       pod.Size,
       pod.Colour,
       pod.MRP,
       pod.StyleId
     FROM webTmpDispatch tmp
     INNER JOIN vwPoDetails pod ON tmp.POID = pod.POID
     WHERE tmp.SessionId = ?
       AND tmp.POBarcode = ?
       AND COALESCE(tmp.Quantity, 0) <> 0
     ORDER BY tmp.POID, tmp.WTDID`,
    [sessionId, poBarcode]
  );
}

export async function listDispatchViewRows(poBarcode) {
  return query(
    `SELECT
       MIN(disp.DID) AS WTDID,
       disp.POID,
       SUM(COALESCE(disp.DispatchQty, 0)) AS DispatchQty,
       disp.POBarcode,
       MAX(disp.DispatchDate) AS DispatchDate,
       MAX(COALESCE(disp.Quantity, 0)) AS Quantity,
       pod.HSNCode,
       pod.VendorArticleName,
       pod.Size,
       pod.Colour,
       MAX(COALESCE(pod.MRP, 0)) AS MRP,
       MAX(COALESCE(pod.Quantity, 0)) - SUM(COALESCE(disp.DispatchQty, 0)) AS PendingQuantity,
       pod.StyleId,
       MAX(disp.DispatchNo) AS DispatchNo,
       MAX(disp.InvoiceNo) AS InvoiceNo
     FROM vwDispatchDetails disp
     INNER JOIN vwPoDetails pod ON pod.POID = disp.POID
     WHERE disp.POBarcode = ?
     GROUP BY
       disp.POID,
       disp.POBarcode,
       pod.HSNCode,
       pod.VendorArticleName,
       pod.Size,
       pod.Colour,
       pod.StyleId,
       disp.DispatchNo
     ORDER BY disp.POID, disp.DispatchNo`,
    [poBarcode]
  );
}

export async function updateDispatchDraftQty({ sessionId, poBarcode, draftId, dispatchQty }) {
  const qty = Math.max(0, Number(dispatchQty || 0));
  const result = await query(
    `UPDATE webTmpDispatch
     SET DispatchQty = ?
     WHERE SessionId = ?
       AND POBarcode = ?
       AND WTDID = ?
       AND COALESCE(DispatchNo, '') = ''`,
    [qty, sessionId, poBarcode, draftId]
  );

  return {
    updatedRows: result.affectedRows || 0,
    message: 'Dispatch quantity updated.',
  };
}

export async function postDispatch({ sessionId, poBarcode, invoiceNo }) {
  if (!poBarcode) throw new Error('Please enter PO number before posting the entry.');
  if (!invoiceNo) throw new Error('Please enter an invoice number before posting the entry.');

  return withTransaction(async (run) => {
    await ensureWebDispatchTables(run);

    const existingInvoiceRows = await run(
      'SELECT InvoiceID FROM tblInvoiceHeader WHERE InvoiceNo = ? LIMIT 1',
      [invoiceNo]
    );
    if (existingInvoiceRows.length) {
      throw new Error('The specified invoice number has already been used. Please enter a different invoice number.');
    }

    const pendingRows = await run(
      `SELECT WTDID
       FROM webTmpDispatch
       WHERE SessionId = ?
         AND POBarcode = ?
         AND COALESCE(DispatchQty, 0) > 0
         AND COALESCE(DispatchNo, '') = ''
       LIMIT 1`,
      [sessionId, poBarcode]
    );
    if (!pendingRows.length) {
      throw new Error('There are no records available to post or records are already posted. Please check dispatch number.');
    }

    await run(
      `DELETE FROM webTmpDispatch
       WHERE SessionId = ?
         AND POBarcode = ?
         AND COALESCE(DispatchQty, 0) = 0`,
      [sessionId, poBarcode]
    );

    const dispatchNo = await nextDispatchNo(run);
    await run(
      `UPDATE webTmpDispatch
       SET DispatchNo = ?,
           DispatchDate = NOW(),
           InvoiceNo = ?
       WHERE SessionId = ?
         AND POBarcode = ?
         AND COALESCE(DispatchQty, 0) > 0
         AND COALESCE(DispatchNo, '') = ''`,
      [dispatchNo, invoiceNo, sessionId, poBarcode]
    );

    await run(
      'INSERT INTO tblDispatchHeader (DispatchNo, DispatchDate) VALUES (?, NOW())',
      [dispatchNo]
    );

    const inserted = await run(
      `INSERT INTO tblDispatch
         (POID, DispatchQty, POBarcode, DispatchNo, InvoiceNo, DispatchDate)
       SELECT POID, DispatchQty, POBarcode, DispatchNo, InvoiceNo, DispatchDate
       FROM webTmpDispatch
       WHERE SessionId = ?
         AND POBarcode = ?
         AND COALESCE(DispatchQty, 0) > 0
         AND DispatchNo = ?`,
      [sessionId, poBarcode, dispatchNo]
    );

    await run(
      'INSERT INTO tblInvoiceHeader (POBarcode, InvoiceNo) VALUES (?, ?)',
      [poBarcode, invoiceNo]
    );

    return {
      dispatchNo,
      insertedRows: inserted.affectedRows || 0,
      message: `Dispatch posted with ${dispatchNo}.`,
    };
  });
}

export async function uploadDispatchFile({ sessionId, selectedPO = '', fileBuffer }) {
  if (!fileBuffer?.length) throw new Error('Please select a file to import.');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.getWorksheet('Sheet1') || workbook.worksheets[0];
  if (!worksheet) throw new Error('The uploaded workbook does not contain a worksheet.');

  const headers = readHeaderMap(worksheet);
  const items = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const poBarcode = cellText(row, headers.POBarcode) || selectedPO;
    const vendorArticleName = cellText(row, headers.VendorArticleName);
    const dispatchQty = Number(cellText(row, headers.DispatchQty) || 0);
    if (!poBarcode || !vendorArticleName) return;
    items.push({ poBarcode, vendorArticleName, dispatchQty });
  });

  if (!items.length) throw new Error('No dispatch rows were found in the uploaded file.');

  const poBarcodes = [...new Set(items.map((item) => item.poBarcode))];
  if (selectedPO && poBarcodes.some((po) => po !== selectedPO)) {
    throw new Error('Uploaded file contains a different PO Number than the selected PO.');
  }

  return withTransaction(async (run) => {
    await ensureWebDispatchTables(run);
    await run('DELETE FROM webTmpDispatch WHERE SessionId = ?', [sessionId]);

    let insertedRows = 0;
    let skippedRows = 0;
    for (const item of items) {
      const poRows = await run(
        `SELECT POID, Quantity
         FROM vwPoDetails
         WHERE POBarcode = ?
           AND VendorArticleName = ?
         LIMIT 1`,
        [item.poBarcode, item.vendorArticleName]
      );

      const poRow = poRows[0];
      if (!poRow?.POID) {
        skippedRows += 1;
        continue;
      }

      const dispatchRows = await run(
        `SELECT SUM(COALESCE(DispatchQty, 0)) AS PartialDispatchQty
         FROM vwDispatchDetails
         WHERE POBarcode = ?
           AND POID = ?`,
        [item.poBarcode, poRow.POID]
      );
      const partialDispatchQty = Number(dispatchRows[0]?.PartialDispatchQty || 0);
      const quantity = Math.max(0, Number(poRow.Quantity || 0) - partialDispatchQty);

      await run(
        `INSERT INTO webTmpDispatch
           (SessionId, POBarcode, POID, DispatchQty, Quantity)
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, item.poBarcode, poRow.POID, item.dispatchQty, quantity]
      );
      insertedRows += 1;
    }

    return {
      poBarcode: selectedPO || poBarcodes[0],
      insertedRows,
      skippedRows,
      message: `${insertedRows} dispatch row(s) imported${skippedRows ? `, ${skippedRows} skipped` : ''}.`,
    };
  });
}

export async function ensureWebDispatchTables(run = query) {
  await run(
    `CREATE TABLE IF NOT EXISTS webTmpDispatch (
       WTDID BIGINT NOT NULL AUTO_INCREMENT,
       SessionId VARCHAR(64) NOT NULL,
       POID INT NULL,
       DispatchQty INT NULL DEFAULT 0,
       TrollySize VARCHAR(50) NULL,
       AppointmentDate DATETIME NULL,
       POBarcode VARCHAR(50) NULL,
       CreatedOn DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
       DispatchDate DATETIME NULL,
       AvailableQuantity INT NULL DEFAULT 0,
       Quantity INT NULL DEFAULT 0,
       DispatchNo VARCHAR(20) NULL,
       InvoiceNo VARCHAR(100) NULL,
       PRIMARY KEY (WTDID),
       INDEX IX_webTmpDispatch_SessionPO (SessionId, POBarcode),
       INDEX IX_webTmpDispatch_SessionPOID (SessionId, POID),
       INDEX IX_webTmpDispatch_DispatchNo (DispatchNo)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

async function nextDispatchNo(run) {
  const rows = await run(
    `SELECT MAX(CAST(SUBSTRING(DispatchNo, 2) AS UNSIGNED)) AS MaxDispatchNo
     FROM tblDispatchHeader
     WHERE DispatchNo REGEXP '^D[0-9]+$'`
  );
  const nextNumber = Number(rows[0]?.MaxDispatchNo || 0) + 1;
  return `D${nextNumber}`;
}

function readHeaderMap(worksheet) {
  const map = {};
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    const key = String(cell.value || '').replace(/\s+/g, '').trim();
    if (key) map[key] = colNumber;
  });

  for (const required of ['POBarcode', 'VendorArticleName', 'DispatchQty']) {
    if (!map[required]) {
      throw new Error(`Upload file is missing required column: ${required}`);
    }
  }

  return map;
}

function cellText(row, columnNumber) {
  if (!columnNumber) return '';
  const value = row.getCell(columnNumber).value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.text) return String(value.text).trim();
  if (typeof value === 'object' && value.result !== undefined) return String(value.result).trim();
  return String(value).trim();
}
