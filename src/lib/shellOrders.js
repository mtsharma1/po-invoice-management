import { query, withTransaction } from './db';
import { fetchTranzactAvailableStock } from './tranzact';

export async function listPOBarcodes() {
  return query('SELECT POBarcode FROM vwPOHeader ORDER BY POBarcode');
}

export async function getShellOrderContext(poBarcode) {
  if (!poBarcode) return null;
  const rows = await query(
    `SELECT
       POBarcode,
       COALESCE(NULLIF(Party, ''), VendorName, '') AS Party,
       VendorName,
       VendorGSTIN,
       ShipTo,
       BillTo,
       POApprovedDate,
       EstimatedDeliveryDate
     FROM tblPOHeaders
     WHERE POBarcode = ?
     LIMIT 1`,
    [poBarcode]
  );
  return rows[0] || null;
}

export async function listShellOrders({ poBarcode = '', limit = 500 } = {}) {
  const where = poBarcode ? 'WHERE POBarcode = ?' : '';
  const params = poBarcode ? [poBarcode, Number(limit)] : [Number(limit)];
  return query(
    `SELECT
       SOID,
       POID,
       POBarcode,
       FactoryDispatchDate,
       S01,
       M02,
       L03,
       TotalQty,
       ShellQTY_S,
       ShellQTY_M,
       ShellQTY_L,
       TRANZACT_QTY_S,
       TRANZACT_QTY_M,
       TRANZACT_QTY_L,
       FINAL_QTY_S,
       FINAL_QTY_M,
       FINAL_QTY_L,
       Size,
       Colour,
       VendorArticleName,
       SKUCode,
       ParentSKU,
       ParentSKUSize,
       Quantity,
       AvailableStock,
       Category
     FROM vwShellOrders
     ${where}
     ORDER BY POBarcode, ParentSKU, ParentSKUSize, SOID
     LIMIT ?`,
    params
  );
}

export async function getShellOrderScreenData(poBarcode = '') {
  const [poOptions, poContext, rows] = await Promise.all([
    listPOBarcodes(),
    getShellOrderContext(poBarcode),
    listShellOrders({ poBarcode, limit: 1000 }),
  ]);

  return { poOptions, poContext, rows };
}

export async function createShellOrder(poBarcode) {
  if (!poBarcode) throw new Error('Please select PO Barcode to create shell order.');

  return withTransaction(async (run) => {
    const existing = await run('SELECT SOID FROM tblShellOrders WHERE POBarcode = ? LIMIT 1', [poBarcode]);
    if (existing.length) {
      return { created: false, message: 'Shell orders already exist for this PO Barcode.' };
    }

    const result = await run(
      `INSERT INTO tblShellOrders
         (POID, POBarcode, SKUCode, VendorArticleName, FactoryDispatchDate, Size, Colour, ParentSKU, ParentSKUSize)
       SELECT
         POID,
         ?,
         SKUCode,
         VendorArticleName,
         FactoryDispatchDate,
         Size,
         Colour,
         CASE
           WHEN INSTR(VendorArticleName, '_') > 0
             THEN LEFT(VendorArticleName, LENGTH(VendorArticleName) - LOCATE('_', REVERSE(VendorArticleName)))
           ELSE VendorArticleName
         END AS ParentSKU,
         CASE
           WHEN INSTR(VendorArticleName, '_') > 0
             THEN CAST(SUBSTRING_INDEX(VendorArticleName, '_', -1) AS UNSIGNED)
           ELSE 0
         END AS ParentSKUSize
       FROM vwPoDetails
       WHERE POBarcode = ?`,
      [poBarcode, poBarcode]
    );

    await ensureAvailableStockTable(run);
    await run(
      `UPDATE tblShellOrders so
       INNER JOIN tblAvailableStock stock ON so.VendorArticleName = stock.ItemId
       SET so.AvailableStock = stock.Stock
       WHERE so.POBarcode = ?`,
      [poBarcode]
    );

    await updateSizeWiseQty(poBarcode, run);
    await updateTranzactQuantitiesFromAvailableStock(poBarcode, run);

    return {
      created: true,
      insertedRows: result.affectedRows || 0,
      message: 'Shell Orders created successfully.',
    };
  });
}

export async function refreshAvailableStockFromTranzact() {
  const items = await fetchTranzactAvailableStock({ pages: 5 });

  return withTransaction(async (run) => {
    await ensureAvailableStockTable(run);
    await run('DELETE FROM tblAvailableStock');

    if (items.length) {
      const values = items.map((item) => [
        item.uuid,
        item.itemId,
        item.productName,
        item.unit,
        item.hsnCode,
        item.itemType,
        item.isService,
        item.price,
        item.stock,
        item.categoryName,
      ]);

      await run(
        `INSERT INTO tblAvailableStock
           (uuid, ItemId, ProductName, Unit, HSNCode, ItemType, IsService, Price, Stock, CategoryName)
         VALUES ?`,
        [values]
      );
    }

    return { savedCount: items.length, message: `${items.length} stock records saved successfully.` };
  });
}

export async function updateTranzactQuantitiesFromAvailableStock(poBarcode, existingRun = null) {
  if (!poBarcode) throw new Error('Please select PO Barcode.');

  const work = async (run) => {
    await ensureAvailableStockTable(run);
    const rows = await run(
      `SELECT so.SOID, so.VendorArticleName, COALESCE(stock.Stock, 0) AS AvailableStock
       FROM tblShellOrders so
       LEFT JOIN tblAvailableStock stock ON stock.ItemId = so.VendorArticleName
       WHERE so.POBarcode = ?`,
      [poBarcode]
    );

    let updatedRows = 0;
    for (const row of rows) {
      const availableStock = Number(row.AvailableStock || 0);
      if (availableStock <= 0) continue;

      const suffix = Number(String(row.VendorArticleName || '').slice(-2));
      if (suffix === 1) {
        const result = await run('UPDATE tblShellOrders SET TRANZACT_QTY_S = ? WHERE SOID = ?', [availableStock, row.SOID]);
        updatedRows += result.affectedRows || 0;
      } else if (suffix === 2) {
        const result = await run('UPDATE tblShellOrders SET TRANZACT_QTY_M = ? WHERE SOID = ?', [availableStock, row.SOID]);
        updatedRows += result.affectedRows || 0;
      } else if (suffix === 3) {
        const result = await run('UPDATE tblShellOrders SET TRANZACT_QTY_L = ? WHERE SOID = ?', [availableStock, row.SOID]);
        updatedRows += result.affectedRows || 0;
      }
    }

    return { updatedRows, message: `Tranzact quantities refreshed for ${updatedRows} row(s).` };
  };

  if (existingRun) return work(existingRun);
  return withTransaction(work);
}

async function updateSizeWiseQty(poBarcode, run) {
  const parentRows = await run(
    `SELECT
       ParentSKU,
       COUNT(*) AS ParentSKUCount,
       SUM(CASE WHEN Size = 'S' THEN COALESCE(Quantity, 0) ELSE 0 END) AS sQty,
       SUM(CASE WHEN Size = 'M' THEN COALESCE(Quantity, 0) ELSE 0 END) AS mQty,
       SUM(CASE WHEN Size = 'L' THEN COALESCE(Quantity, 0) ELSE 0 END) AS lQty,
       MAX(CASE WHEN ParentSKUSize = 123 THEN COALESCE(Quantity, 0) ELSE 0 END) AS setQty123,
       MAX(CASE WHEN ParentSKUSize = 12 THEN COALESCE(Quantity, 0) ELSE 0 END) AS setQty12
     FROM vwShellOrders
     WHERE POBarcode = ?
     GROUP BY ParentSKU
     ORDER BY ParentSKU`,
    [poBarcode]
  );

  for (const parent of parentRows) {
    const parentSKU = parent.ParentSKU;
    const parentSKUCount = Number(parent.ParentSKUCount || 0);
    const sQty = Number(parent.sQty || 0);
    const mQty = Number(parent.mQty || 0);
    const lQty = Number(parent.lQty || 0);
    const setQty123 = Number(parent.setQty123 || 0);
    const setQty12 = Number(parent.setQty12 || 0);

    if (parentSKUCount === 1) {
      if (setQty12 > 0) {
        await run(
          'UPDATE tblShellOrders SET S01 = ?, M02 = ? WHERE POBarcode = ? AND ParentSKU = ?',
          [setQty12, setQty12, poBarcode, parentSKU]
        );
      } else if (setQty123 > 0) {
        await run(
          'UPDATE tblShellOrders SET S01 = ?, M02 = ?, L03 = ? WHERE POBarcode = ? AND ParentSKU = ?',
          [setQty123, setQty123, setQty123, poBarcode, parentSKU]
        );
      } else {
        await run(
          'UPDATE tblShellOrders SET S01 = ?, M02 = ?, L03 = ? WHERE POBarcode = ? AND ParentSKU = ?',
          [sQty + setQty123, mQty + setQty123, lQty + setQty123, poBarcode, parentSKU]
        );
      }
    } else if (parentSKUCount >= 2) {
      if (setQty123 > 0 || setQty12 > 0) {
        const soidRows = await run(
          `SELECT SOID
           FROM tblShellOrders
           WHERE POBarcode = ?
             AND ParentSKU = ?
             AND ParentSKUSize IN (123, 12)
           ORDER BY CASE WHEN ParentSKUSize = 123 THEN 0 ELSE 1 END, SOID DESC
           LIMIT 1`,
          [poBarcode, parentSKU]
        );
        const soid = soidRows[0]?.SOID;
        if (soid) {
          await run(
            'UPDATE tblShellOrders SET S01 = ?, M02 = ?, L03 = ? WHERE SOID = ?',
            [sQty + setQty123 + setQty12, mQty + setQty123 + setQty12, lQty + setQty123, soid]
          );
        }
      } else {
        await run(
          'UPDATE tblShellOrders SET S01 = ? WHERE POBarcode = ? AND VendorArticleName = ?',
          [sQty, poBarcode, `${parentSKU}_01`]
        );
        await run(
          'UPDATE tblShellOrders SET M02 = ? WHERE POBarcode = ? AND VendorArticleName = ?',
          [mQty, poBarcode, `${parentSKU}_02`]
        );
        await run(
          'UPDATE tblShellOrders SET L03 = ? WHERE POBarcode = ? AND VendorArticleName = ?',
          [lQty, poBarcode, `${parentSKU}_03`]
        );
      }
    }
  }
}

export async function buildShellOrderExportWorkbook(poBarcode = '') {
  const rows = await listShellOrders({ poBarcode, limit: 10000 });
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Teakwood PO & Invoice Web';
  workbook.created = new Date();
  const ws = workbook.addWorksheet('Shell Orders', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
    views: [{ showGridLines: false }],
  });

  const columns = [
    ['SOID', 'SOID', 10],
    ['POID', 'POID', 10],
    ['POBarcode', 'PO Barcode', 20],
    ['AvailableStock', 'Available Stock', 15],
    ['FactoryDispatchDate', 'Factory Dispatch Date', 20],
    ['S01', 'S01', 10],
    ['M02', 'M02', 10],
    ['L03', 'L03', 10],
    ['TotalQty', 'Total Qty', 12],
    ['ShellQTY_S', 'Shell Qty S', 13],
    ['ShellQTY_M', 'Shell Qty M', 13],
    ['ShellQTY_L', 'Shell Qty L', 13],
    ['TRANZACT_QTY_S', 'Tranzact Qty S', 15],
    ['TRANZACT_QTY_M', 'Tranzact Qty M', 15],
    ['TRANZACT_QTY_L', 'Tranzact Qty L', 15],
    ['FINAL_QTY_S', 'Final Qty S', 13],
    ['FINAL_QTY_M', 'Final Qty M', 13],
    ['FINAL_QTY_L', 'Final Qty L', 13],
    ['Size', 'Size', 10],
    ['Colour', 'Colour', 15],
    ['VendorArticleName', 'Vendor Article Name', 28],
    ['SKUCode', 'SKU Code', 20],
    ['ParentSKU', 'Parent SKU', 28],
    ['ParentSKUSize', 'Parent SKU Size', 15],
    ['Quantity', 'Quantity', 12],
    ['Category', 'Category', 14],
  ];

  ws.columns = columns.map(([key, header, width]) => ({ key, header, width }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF8' } };
  ws.addRows(rows);
  ws.autoFilter = { from: 'A1', to: `${columnName(columns.length)}1` };
  ws.pageSetup.printArea = `A1:${columnName(columns.length)}${Math.max(rows.length + 1, 2)}`;

  return workbook;
}

export async function ensureAvailableStockTable(run = query) {
  await run(
    `CREATE TABLE IF NOT EXISTS tblAvailableStock (
       MID INT NOT NULL AUTO_INCREMENT,
       uuid VARCHAR(255) NULL,
       ItemId VARCHAR(255) NULL,
       ProductName VARCHAR(255) NULL,
       Unit VARCHAR(255) NULL,
       HSNCode VARCHAR(255) NULL,
       ItemType VARCHAR(255) NULL,
       IsService VARCHAR(255) NULL,
       Price DECIMAL(18,2) NULL DEFAULT 0,
       Stock INT NULL DEFAULT 0,
       CategoryName VARCHAR(255) NULL,
       CreatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (MID),
       INDEX IX_tblAvailableStock_ItemId (ItemId),
       INDEX IX_tblAvailableStock_uuid (uuid)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

function columnName(index) {
  let name = '';
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}
