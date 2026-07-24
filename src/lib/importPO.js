import { query, withTransaction } from './db';
import { ensurePOImportDateColumn } from './poSchema';

const headerColumns = [
  'POBarcode',
  'POApprovedDate',
  'PurchaseType',
  'EstimatedDeliveryDate',
  'VendorName',
  'VendorGSTIN',
  'BillTo',
  'ShipTo',
  'VendorAddress',
];

const detailColumns = [
  'POBarcode',
  'SKUId',
  'StyleId',
  'SKUCode',
  'HSNCode',
  'Brand',
  'GTIN',
  'Category',
  'VendorArticleNumber',
  'VendorArticleName',
  'Size',
  'Colour',
  'MRP',
  'CreditPeriod',
  'MarginType',
  'AgreedMargin',
  'GrossMargin',
  'Quantity',
  'FOBAmount',
  'ListPriceFOBTransportExcise',
  'LandingPrice',
  'EstimatedDeliveryDate',
  'TaxBCD',
  'TaxBCDAmount',
  'BuyingTaxIGST',
  'BuyingTaxIGSTAmount',
  'TaxSWT',
  'TaxSWTAmount',
  'SellingTax',
  'SellingTaxCGST',
  'SellingTaxIGST',
  'SellingTaxIGSTAmount',
  'SellingTaxSGST',
  'SellingTaxSGSTAmount',
  'FactoryDispatchDate',
];

const detailMap = {
  SKUId: ['SKU Id', 'SKU ID'],
  StyleId: ['Style Id', 'Style ID'],
  SKUCode: ['SKU Code'],
  HSNCode: ['HSN Code', 'HSN CODE'],
  Brand: ['Brand'],
  GTIN: ['GTIN'],
  Category: ['Category'],
  VendorArticleNumber: ['Vendor Article Number'],
  VendorArticleName: ['Vendor Article Name'],
  Size: ['Size'],
  Colour: ['Colour', 'Color'],
  MRP: ['Mrp', 'MRP'],
  CreditPeriod: ['Credit Period'],
  MarginType: ['Margin Type'],
  AgreedMargin: ['Agreed Margin'],
  GrossMargin: ['Gross Margin'],
  Quantity: ['Quantity'],
  FOBAmount: ['FOB Amount'],
  ListPriceFOBTransportExcise: ['List price(FOB+Transport-Excise)', 'List Price(FOB+Transport-Excise)'],
  LandingPrice: ['Landing Price'],
  EstimatedDeliveryDate: ['Estimated Delivery Date'],
  TaxBCD: ['Tax BCD'],
  TaxBCDAmount: ['Tax BCD Amount'],
  BuyingTaxIGST: ['Buying Tax IGST'],
  BuyingTaxIGSTAmount: ['Buying Tax IGST Amount'],
  TaxSWT: ['Tax SWT'],
  TaxSWTAmount: ['Tax SWT Amount'],
  SellingTax: ['Selling Tax'],
  SellingTaxCGST: ['Selling Tax CGST'],
  SellingTaxIGST: ['Selling Tax IGST'],
  SellingTaxIGSTAmount: ['Selling Tax IGST Amount'],
  SellingTaxSGST: ['Selling Tax SGST'],
  SellingTaxSGSTAmount: ['Selling Tax SGST Amount'],
  FactoryDispatchDate: ['Factory Dispatch Date'],
};

export async function getImportScreenData(sessionId) {
  await ensureWebImportTables();
  const [headers, rows] = await Promise.all([
    query('SELECT * FROM webTmpPOHeaders WHERE SessionId = ? LIMIT 1', [sessionId]),
    query(
      `SELECT *
       FROM webTmpPODetails
       WHERE SessionId = ?
       ORDER BY WTID
       LIMIT 5000`,
      [sessionId]
    ),
  ]);

  return { header: headers[0] || blankHeader(), rows };
}

export async function stagePurchaseOrderWorkbook(sessionId, fileBuffer) {
  const { header, details } = await parsePurchaseOrderWorkbook(fileBuffer);

  return withTransaction(async (run) => {
    await ensureWebImportTables(run);
    const existing = await run('SELECT POBarcode FROM tblPOHeaders WHERE POBarcode = ? LIMIT 1', [header.POBarcode]);
    if (existing.length) {
      throw new Error('The selected purchase order has already been imported.');
    }

    await run('DELETE FROM webTmpPODetails WHERE SessionId = ?', [sessionId]);
    await run('DELETE FROM webTmpPOHeaders WHERE SessionId = ?', [sessionId]);

    await run(
      `INSERT INTO webTmpPOHeaders (SessionId, ${headerColumns.join(', ')})
       VALUES (?, ${headerColumns.map(() => '?').join(', ')})`,
      [sessionId, ...headerColumns.map((column) => header[column] ?? null)]
    );

    if (details.length) {
      const values = details.map((row) => [sessionId, ...detailColumns.map((column) => row[column] ?? null)]);
      await run(
        `INSERT INTO webTmpPODetails (SessionId, ${detailColumns.join(', ')})
         VALUES ?`,
        [values]
      );
    }

    return {
      poBarcode: header.POBarcode,
      insertedRows: details.length,
      message: `Import completed for PO: ${header.POBarcode}`,
    };
  });
}

export async function saveStagedPurchaseOrder(sessionId) {
  await ensurePOImportDateColumn();

  return withTransaction(async (run) => {
    await ensureWebImportTables(run);
    const headers = await run('SELECT * FROM webTmpPOHeaders WHERE SessionId = ? LIMIT 1', [sessionId]);
    const header = headers[0];
    if (!header?.POBarcode) throw new Error('Please import PO before saving to database.');

    const existing = await run('SELECT POBarcode FROM tblPOHeaders WHERE POBarcode = ? LIMIT 1', [header.POBarcode]);
    if (existing.length) {
      throw new Error('The selected purchase order has already been saved to database.');
    }

    const detailCountRows = await run(
      'SELECT COUNT(*) AS rowCount FROM webTmpPODetails WHERE SessionId = ?',
      [sessionId]
    );
    const detailCount = Number(detailCountRows[0]?.rowCount || 0);
    if (!detailCount) throw new Error('No imported SKU rows found to save.');

    await run(
      `INSERT INTO tblPOHeaders (${headerColumns.join(', ')}, POImportDate)
       SELECT ${headerColumns.join(', ')}, CURRENT_TIMESTAMP
       FROM webTmpPOHeaders
       WHERE SessionId = ?`,
      [sessionId]
    );

    await run(
      `INSERT INTO tblPODetails (${detailColumns.join(', ')})
       SELECT ${detailColumns.join(', ')}
       FROM webTmpPODetails
       WHERE SessionId = ?
       ORDER BY WTID`,
      [sessionId]
    );

    const dispatchSchedule = await assignFactoryDispatchDates(run);

    await run('DELETE FROM webTmpPODetails WHERE SessionId = ?', [sessionId]);
    await run('DELETE FROM webTmpPOHeaders WHERE SessionId = ?', [sessionId]);

    return {
      poBarcode: header.POBarcode,
      savedRows: detailCount,
      assignedDispatchRows: dispatchSchedule.assignedRows,
      dispatchDateBatches: dispatchSchedule.dateBatches,
      message: `PO ${header.POBarcode} saved to database. Factory dispatch dates assigned to ${dispatchSchedule.assignedRows} line${dispatchSchedule.assignedRows === 1 ? '' : 's'}.`,
    };
  });
}

export async function importPurchaseOrderWorkbook(fileBuffer) {
  const { header, details } = await parsePurchaseOrderWorkbook(fileBuffer);
  await ensurePOImportDateColumn();

  return withTransaction(async (run) => {
    const existing = await run('SELECT POBarcode FROM tblPOHeaders WHERE POBarcode = ? LIMIT 1', [header.POBarcode]);
    if (existing.length) {
      throw new Error('The selected purchase order has already been imported.');
    }

    await run(
      `INSERT INTO tblPOHeaders (${headerColumns.join(', ')}, POImportDate)
       VALUES (${headerColumns.map(() => '?').join(', ')}, CURRENT_TIMESTAMP)`,
      headerColumns.map((column) => header[column] ?? null)
    );

    await run(
      `INSERT INTO tblPODetails (${detailColumns.join(', ')})
       VALUES ?`,
      [details.map((row) => detailColumns.map((column) => row[column] ?? null))]
    );

    const dispatchSchedule = await assignFactoryDispatchDates(run);

    return {
      poBarcode: header.POBarcode,
      insertedRows: details.length,
      assignedDispatchRows: dispatchSchedule.assignedRows,
      dispatchDateBatches: dispatchSchedule.dateBatches,
      message: `Import completed for PO: ${header.POBarcode}. Factory dispatch dates assigned to ${dispatchSchedule.assignedRows} line${dispatchSchedule.assignedRows === 1 ? '' : 's'}.`,
    };
  });
}

export async function assignFactoryDispatchDates(run = query) {
  const latestRows = await run(
    `SELECT DATE(FactoryDispatchDate) AS LastDate
     FROM tblPODetails
     WHERE FactoryDispatchDate IS NOT NULL
     ORDER BY FactoryDispatchDate DESC, POID DESC
     LIMIT 1
     FOR UPDATE`
  );

  let currentDate;
  let cumulativeQty = 0;
  const lastAssignedDate = sqlDateKey(latestRows[0]?.LastDate);

  if (lastAssignedDate) {
    currentDate = lastAssignedDate;
    const quantities = await run(
      `SELECT POID, COALESCE(Quantity, 0) AS Quantity
       FROM tblPODetails
       WHERE FactoryDispatchDate >= ?
         AND FactoryDispatchDate < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY POID
       FOR UPDATE`,
      [lastAssignedDate, lastAssignedDate]
    );
    cumulativeQty = quantities.reduce((total, row) => total + Number(row.Quantity || 0), 0);
  } else {
    currentDate = getNextWorkingDate(addDays(indiaDateKey(), 1));
  }

  const unassignedRows = await run(
    `SELECT POID, COALESCE(Quantity, 0) AS Quantity
     FROM tblPODetails
     WHERE FactoryDispatchDate IS NULL
     ORDER BY POID ASC
     FOR UPDATE`
  );

  const dateGroups = new Map();
  for (const row of unassignedRows) {
    const rowQty = Number(row.Quantity || 0);
    if (cumulativeQty + rowQty > 1000) {
      currentDate = getNextWorkingDate(addDays(currentDate, 1));
      cumulativeQty = 0;
    }

    cumulativeQty += rowQty;
    const ids = dateGroups.get(currentDate) || [];
    ids.push(Number(row.POID));
    dateGroups.set(currentDate, ids);
  }

  for (const [dispatchDate, poids] of dateGroups) {
    await run(
      `UPDATE tblPODetails
       SET FactoryDispatchDate = ?
       WHERE POID IN (${poids.map(() => '?').join(', ')})`,
      [dispatchDate, ...poids]
    );
  }

  return {
    assignedRows: unassignedRows.length,
    dateBatches: dateGroups.size,
  };
}

function indiaDateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function sqlDateKey(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function addDays(dateKey, days) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, '0'))
    .join('-');
}

function getNextWorkingDate(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDay() === 0 ? addDays(dateKey, 1) : dateKey;
}

export async function ensureWebImportTables(run = query) {
  await run(
    `CREATE TABLE IF NOT EXISTS webTmpPOHeaders (
       SessionId VARCHAR(64) NOT NULL,
       POBarcode VARCHAR(50) NULL,
       POApprovedDate DATETIME NULL,
       PurchaseType VARCHAR(50) NULL,
       EstimatedDeliveryDate DATETIME NULL,
       VendorName VARCHAR(255) NULL,
       VendorGSTIN VARCHAR(20) NULL,
       BillTo TEXT NULL,
       ShipTo TEXT NULL,
       VendorAddress TEXT NULL,
       CreatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (SessionId),
       INDEX IX_webTmpPOHeaders_POBarcode (POBarcode)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS webTmpPODetails (
       WTID BIGINT NOT NULL AUTO_INCREMENT,
       SessionId VARCHAR(64) NOT NULL,
       POBarcode VARCHAR(50) NULL,
       SKUId VARCHAR(100) NULL,
       StyleId VARCHAR(100) NULL,
       SKUCode VARCHAR(100) NULL,
       HSNCode VARCHAR(20) NULL,
       Brand VARCHAR(100) NULL,
       GTIN VARCHAR(50) NULL,
       Category VARCHAR(100) NULL,
       VendorArticleNumber VARCHAR(255) NULL,
       VendorArticleName VARCHAR(255) NULL,
       Size VARCHAR(50) NULL,
       Colour VARCHAR(100) NULL,
       MRP DECIMAL(18,2) NULL DEFAULT 0,
       CreditPeriod VARCHAR(50) NULL,
       MarginType VARCHAR(50) NULL,
       AgreedMargin DECIMAL(18,2) NULL DEFAULT 0,
       GrossMargin DECIMAL(18,2) NULL DEFAULT 0,
       Quantity INT NULL DEFAULT 0,
       FOBAmount DECIMAL(18,2) NULL DEFAULT 0,
       ListPriceFOBTransportExcise DECIMAL(18,2) NULL DEFAULT 0,
       LandingPrice DECIMAL(18,2) NULL DEFAULT 0,
       EstimatedDeliveryDate DATETIME NULL,
       TaxBCD DECIMAL(18,2) NULL DEFAULT 0,
       TaxBCDAmount DECIMAL(18,2) NULL DEFAULT 0,
       BuyingTaxIGST DECIMAL(18,2) NULL DEFAULT 0,
       BuyingTaxIGSTAmount DECIMAL(18,2) NULL DEFAULT 0,
       TaxSWT DECIMAL(18,2) NULL DEFAULT 0,
       TaxSWTAmount DECIMAL(18,2) NULL DEFAULT 0,
       SellingTax DECIMAL(18,2) NULL DEFAULT 0,
       SellingTaxCGST DECIMAL(18,2) NULL DEFAULT 0,
       SellingTaxIGST DECIMAL(18,2) NULL DEFAULT 0,
       SellingTaxIGSTAmount DECIMAL(18,2) NULL DEFAULT 0,
       SellingTaxSGST DECIMAL(18,2) NULL DEFAULT 0,
       SellingTaxSGSTAmount DECIMAL(18,2) NULL DEFAULT 0,
       FactoryDispatchDate DATETIME NULL,
       CreatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (WTID),
       INDEX IX_webTmpPODetails_SessionId (SessionId),
       INDEX IX_webTmpPODetails_POBarcode (POBarcode)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

async function parsePurchaseOrderWorkbook(fileBuffer) {
  if (!fileBuffer?.length) throw new Error('Please select a purchase order Excel file.');

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.getWorksheet('Purchase Order') || workbook.worksheets[0];
  if (!worksheet) throw new Error('Purchase Order worksheet was not found.');

  const header = readPOHeader(worksheet);
  if (!header.POBarcode) throw new Error('PO Barcode not found.');

  const headerRow = findHeaderRow(worksheet, 'SKU Code');
  if (!headerRow) throw new Error('SKU header row not found.');

  const columnMap = buildColumnMap(worksheet, headerRow);
  const details = readDetailRows(worksheet, headerRow, columnMap, header.POBarcode);
  if (!details.length) throw new Error('No SKU rows were found in the selected file.');

  return { header, details };
}

function readPOHeader(worksheet) {
  return {
    POBarcode: valueByLabel(worksheet, 'PO Barcode'),
    POApprovedDate: toSqlDate(valueByLabel(worksheet, 'PO Approved Date')),
    PurchaseType: valueByLabel(worksheet, 'Purchase Type'),
    EstimatedDeliveryDate: toSqlDate(valueByLabel(worksheet, 'Estimated Delivery Date')),
    VendorName: valueByLabel(worksheet, 'Vendor Name'),
    VendorGSTIN: valueByLabel(worksheet, 'Vendor GSTIN'),
    BillTo: valueByLabel(worksheet, 'Bill To'),
    ShipTo: valueByLabel(worksheet, 'Ship To'),
    VendorAddress: valueByLabel(worksheet, 'Vendor Address'),
  };
}

function valueByLabel(worksheet, labelText) {
  for (let row = 1; row <= 20; row += 1) {
    for (let col = 1; col <= 10; col += 1) {
      if (cellText(worksheet.getCell(row, col)) === labelText) {
        return cellText(worksheet.getCell(row, col + 1));
      }
    }
  }
  return '';
}

function findHeaderRow(worksheet, headerName) {
  for (let row = 1; row <= 50; row += 1) {
    for (let col = 1; col <= 80; col += 1) {
      if (cellText(worksheet.getCell(row, col)) === headerName) return row;
    }
  }
  return 0;
}

function buildColumnMap(worksheet, headerRow) {
  const map = {};
  for (let col = 1; col <= 100; col += 1) {
    const value = cellText(worksheet.getCell(headerRow, col));
    if (value) map[normaliseHeader(value)] = col;
  }
  return map;
}

function readDetailRows(worksheet, headerRow, columnMap, poBarcode) {
  const skuColumn = columnMap[normaliseHeader('SKU Code')];
  const rows = [];
  if (!skuColumn) return rows;

  for (let row = headerRow + 1; row <= worksheet.rowCount; row += 1) {
    if (!cellText(worksheet.getCell(row, skuColumn))) continue;
    const detail = {};
    for (const column of detailColumns) {
      if (column === 'POBarcode') {
        detail[column] = poBarcode;
      } else if (['EstimatedDeliveryDate', 'FactoryDispatchDate'].includes(column)) {
        detail[column] = toSqlDate(getMappedCell(worksheet, row, columnMap, column));
      } else if (numericColumn(column)) {
        detail[column] = toNumber(getMappedCell(worksheet, row, columnMap, column));
      } else {
        detail[column] = getMappedCell(worksheet, row, columnMap, column);
      }
    }
    rows.push(detail);
  }
  return rows;
}

function getMappedCell(worksheet, row, columnMap, column) {
  const headers = detailMap[column] || [column];
  for (const header of headers) {
    const columnNumber = columnMap[normaliseHeader(header)];
    if (columnNumber) return cellValue(worksheet.getCell(row, columnNumber));
  }
  return '';
}

function numericColumn(column) {
  return [
    'MRP',
    'AgreedMargin',
    'GrossMargin',
    'Quantity',
    'FOBAmount',
    'ListPriceFOBTransportExcise',
    'LandingPrice',
    'TaxBCD',
    'TaxBCDAmount',
    'BuyingTaxIGST',
    'BuyingTaxIGSTAmount',
    'TaxSWT',
    'TaxSWTAmount',
    'SellingTax',
    'SellingTaxCGST',
    'SellingTaxIGST',
    'SellingTaxIGSTAmount',
    'SellingTaxSGST',
    'SellingTaxSGSTAmount',
  ].includes(column);
}

function normaliseHeader(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '').trim();
}

function cellText(cell) {
  const value = cellValue(cell);
  return value === null || value === undefined ? '' : String(value).trim();
}

function cellValue(cell) {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value.text !== undefined) return value.text;
  if (typeof value === 'object' && value.result !== undefined) return value.result;
  if (typeof value === 'object' && value.richText) return value.richText.map((part) => part.text).join('');
  return value;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function toSqlDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatSqlDate(value);

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    return Number.isNaN(parsed.getTime()) ? null : formatSqlDate(parsed, true);
  }

  const rawValue = String(value).trim();
  const dmy = rawValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmy) {
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const parsed = new Date(
      year,
      Number(dmy[2]) - 1,
      Number(dmy[1]),
      Number(dmy[4] || 0),
      Number(dmy[5] || 0),
      Number(dmy[6] || 0)
    );
    return Number.isNaN(parsed.getTime()) ? null : formatSqlDate(parsed);
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : formatSqlDate(parsed);
}

function formatSqlDate(date, useUtc = false) {
  const year = useUtc ? date.getUTCFullYear() : date.getFullYear();
  const month = (useUtc ? date.getUTCMonth() : date.getMonth()) + 1;
  const day = useUtc ? date.getUTCDate() : date.getDate();
  const hour = useUtc ? date.getUTCHours() : date.getHours();
  const minute = useUtc ? date.getUTCMinutes() : date.getMinutes();
  const second = useUtc ? date.getUTCSeconds() : date.getSeconds();

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-') + ` ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function blankHeader() {
  return headerColumns.reduce((header, column) => {
    header[column] = '';
    return header;
  }, {});
}
