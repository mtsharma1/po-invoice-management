import { query, withTransaction } from './db';
import { ensurePOConsigneeNameColumn, ensurePOImportDateColumn } from './poSchema';

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
  'ConsigneeName',
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

// These fields remain in the database schema for compatibility with older
// imports, but the current PO workbook marks them red and explicitly excludes
// them from import. Saving null/default values also prevents stale spreadsheet
// values from leaking into new purchase orders.
const ignoredWorkbookColumns = new Set([
  'SKUId',
  'SKUCode',
  'VendorArticleNumber',
  'CreditPeriod',
  'MarginType',
  'AgreedMargin',
  'GrossMargin',
  'FOBAmount',
  'TaxBCD',
  'TaxBCDAmount',
  'BuyingTaxIGST',
  'BuyingTaxIGSTAmount',
  'TaxSWT',
  'TaxSWTAmount',
  'SellingTax',
]);

const ignoredNumericWorkbookColumns = new Set([
  'AgreedMargin',
  'GrossMargin',
  'FOBAmount',
  'TaxBCD',
  'TaxBCDAmount',
  'BuyingTaxIGST',
  'BuyingTaxIGSTAmount',
  'TaxSWT',
  'TaxSWTAmount',
  'SellingTax',
]);

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
  SellingTaxCGST: ['Selling Tax CGST'],
  SellingTaxIGST: ['Selling Tax IGST'],
  SellingTaxIGSTAmount: ['Selling Tax IGST Amount'],
  SellingTaxSGST: ['Selling Tax SGST'],
  SellingTaxSGSTAmount: ['Selling Tax SGST Amount'],
  FactoryDispatchDate: ['Factory Dispatch Date'],
};

const requiredWorkbookDetailColumns = [
  'StyleId',
  'HSNCode',
  'Brand',
  'GTIN',
  'VendorArticleName',
  'Size',
  'Colour',
  'MRP',
  'Quantity',
  'ListPriceFOBTransportExcise',
  'LandingPrice',
  'EstimatedDeliveryDate',
  'SellingTaxCGST',
  'SellingTaxIGST',
  'SellingTaxIGSTAmount',
  'SellingTaxSGST',
  'SellingTaxSGSTAmount',
  'Category',
];

const requiredLineValues = [
  'StyleId',
  'HSNCode',
  'GTIN',
  'VendorArticleName',
  'Size',
  'Colour',
  'MRP',
  'Quantity',
  'Category',
];

const allowedCategories = new Map([
  ['suitcase', 'SuitCase'],
  ['backpack', 'BackPack'],
  ['smallhardcase', 'Small Hard Case'],
]);

export class PurchaseOrderValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'PurchaseOrderValidationError';
    this.issues = issues;
  }
}

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
  await Promise.all([ensurePOImportDateColumn(), ensurePOConsigneeNameColumn()]);

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
       SELECT ${detailColumns.map(detailDatabaseSelectExpression).join(', ')}
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
  await Promise.all([ensurePOImportDateColumn(), ensurePOConsigneeNameColumn()]);

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

    await insertPODetailsWithRowDiagnostics(run, details);

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
       ConsigneeName VARCHAR(255) NULL,
       CreatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (SessionId),
       INDEX IX_webTmpPOHeaders_POBarcode (POBarcode)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  const temporaryHeaderColumns = await run(
    `SELECT COLUMN_NAME AS columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'webTmpPOHeaders'
       AND COLUMN_NAME = 'ConsigneeName'`
  );
  if (!temporaryHeaderColumns.length) {
    await run(
      `ALTER TABLE webTmpPOHeaders
       ADD COLUMN ConsigneeName VARCHAR(255) NULL AFTER VendorAddress`
    );
  }

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
  if (!fileBuffer?.length) {
    throw new PurchaseOrderValidationError('The workbook is empty.', [
      importIssue({ field: 'File', reason: 'The workbook is empty.' }),
    ]);
  }

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(fileBuffer);
  } catch {
    throw new PurchaseOrderValidationError('The file is not a valid Excel .xlsx workbook.', [
      importIssue({ field: 'File format', reason: 'The file is not a valid Excel .xlsx workbook.' }),
    ]);
  }
  const worksheet = workbook.getWorksheet('Purchase Order') || workbook.worksheets[0];
  if (!worksheet) {
    throw new PurchaseOrderValidationError('Purchase Order worksheet was not found.', [
      importIssue({ worksheet: 'Purchase Order', field: 'Worksheet', reason: 'Purchase Order worksheet was not found.' }),
    ]);
  }

  const header = readPOHeader(worksheet);
  if (!header.POBarcode) {
    throw new PurchaseOrderValidationError('PO Barcode not found.', [
      importIssue({ worksheet: worksheet.name, field: 'PO Barcode', reason: 'PO Barcode is blank or its label is missing.' }),
    ]);
  }

  const headerRow = findHeaderRow(worksheet, 'SKU Code');
  if (!headerRow) {
    throw new PurchaseOrderValidationError('SKU header row not found.', [
      importIssue({ worksheet: worksheet.name, field: 'SKU header', reason: 'The item header row could not be identified.' }),
    ]);
  }

  const columnMap = buildColumnMap(worksheet, headerRow);
  const missingHeaders = requiredWorkbookDetailColumns.filter((column) => !mappedColumnNumber(columnMap, column));
  if (missingHeaders.length) {
    const issues = missingHeaders.map((column) => importIssue({
      worksheet: worksheet.name,
      row: headerRow,
      field: displayColumnName(column),
      reason: `Required column "${displayColumnName(column)}" is missing from the item header row.`,
    }));
    throw new PurchaseOrderValidationError('The workbook format does not match the PO template.', issues);
  }

  const { details, issues } = readDetailRows(worksheet, headerRow, columnMap, header.POBarcode);
  if (issues.length) {
    throw new PurchaseOrderValidationError(
      `${issues.length} item validation error${issues.length === 1 ? '' : 's'} found.`,
      issues
    );
  }
  if (!details.length) {
    throw new PurchaseOrderValidationError('No SKU rows were found in the selected file.', [
      importIssue({ worksheet: worksheet.name, row: headerRow + 1, field: 'Item rows', reason: 'No purchase-order item rows were found.' }),
    ]);
  }

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
    ConsigneeName: valueByLabel(worksheet, 'CONSIGNEE NAME'),
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
  const rows = [];
  const issues = [];

  for (let row = headerRow + 1; row <= worksheet.rowCount; row += 1) {
    if (!hasMappedRowData(worksheet, row, columnMap)) continue;
    const detail = {};
    detail.__excelRow = row;
    for (const column of detailColumns) {
      if (column === 'POBarcode') {
        detail[column] = poBarcode;
      } else if (ignoredWorkbookColumns.has(column)) {
        detail[column] = null;
      } else if (['EstimatedDeliveryDate', 'FactoryDispatchDate'].includes(column)) {
        detail[column] = toSqlDate(getMappedCell(worksheet, row, columnMap, column));
      } else if (numericColumn(column)) {
        detail[column] = toNumber(getMappedCell(worksheet, row, columnMap, column));
      } else {
        const value = getMappedCell(worksheet, row, columnMap, column);
        detail[column] = column === 'Category' ? canonicalCategory(value) : value;
      }
    }

    for (const column of requiredLineValues) {
      const rawValue = getMappedCell(worksheet, row, columnMap, column);
      if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
        issues.push(importIssue({
          worksheet: worksheet.name,
          row,
          field: displayColumnName(column),
          reason: `${displayColumnName(column)} is required.`,
        }));
      }
    }

    for (const column of requiredWorkbookDetailColumns.filter(numericColumn)) {
      const rawValue = getMappedCell(worksheet, row, columnMap, column);
      if (rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== '' && !isNumericValue(rawValue)) {
        issues.push(importIssue({
          worksheet: worksheet.name,
          row,
          field: displayColumnName(column),
          reason: `"${String(rawValue).trim()}" is not a valid number.`,
        }));
      }
    }

    const rawDeliveryDate = getMappedCell(worksheet, row, columnMap, 'EstimatedDeliveryDate');
    if (rawDeliveryDate && !toSqlDate(rawDeliveryDate)) {
      issues.push(importIssue({
        worksheet: worksheet.name,
        row,
        field: displayColumnName('EstimatedDeliveryDate'),
        reason: `"${String(rawDeliveryDate).trim()}" is not a valid date.`,
      }));
    }

    const rawCategory = getMappedCell(worksheet, row, columnMap, 'Category');
    if (rawCategory && !canonicalCategory(rawCategory)) {
      issues.push(importIssue({
        worksheet: worksheet.name,
        row,
        field: 'Category',
        reason: `Category must be SuitCase, BackPack, or Small Hard Case; received "${String(rawCategory).trim()}".`,
      }));
    }

    rows.push(detail);
  }
  return { details: rows, issues };
}

function getMappedCell(worksheet, row, columnMap, column) {
  const headers = detailMap[column] || [column];
  for (const header of headers) {
    const columnNumber = columnMap[normaliseHeader(header)];
    if (columnNumber) return cellValue(worksheet.getCell(row, columnNumber));
  }
  return '';
}

function mappedColumnNumber(columnMap, column) {
  const headers = detailMap[column] || [column];
  for (const header of headers) {
    const columnNumber = columnMap[normaliseHeader(header)];
    if (columnNumber) return columnNumber;
  }
  return 0;
}

function hasMappedRowData(worksheet, row, columnMap) {
  return requiredWorkbookDetailColumns.some((column) => {
    const columnNumber = mappedColumnNumber(columnMap, column);
    return columnNumber && cellText(worksheet.getCell(row, columnNumber));
  });
}

function canonicalCategory(value) {
  const key = String(value || '').toLowerCase().replace(/[\s_-]+/g, '');
  return allowedCategories.get(key) || '';
}

function isNumericValue(value) {
  const normalized = String(value).replace(/,/g, '').trim();
  return normalized !== '' && Number.isFinite(Number(normalized));
}

function displayColumnName(column) {
  return detailMap[column]?.[0] || String(column).replace(/([a-z])([A-Z])/g, '$1 $2');
}

function importIssue({ worksheet = '', row = '', field = '', reason = '' }) {
  return { worksheet, row, field, reason };
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

function detailDatabaseSelectExpression(column) {
  if (!ignoredWorkbookColumns.has(column)) return column;
  const fallback = ignoredNumericWorkbookColumns.has(column) ? '0' : "''";
  return `COALESCE(${column}, ${fallback}) AS ${column}`;
}

function detailDatabaseValue(column, value) {
  if (!ignoredWorkbookColumns.has(column)) return value ?? null;
  return ignoredNumericWorkbookColumns.has(column) ? Number(value || 0) : String(value || '');
}

async function insertPODetailsWithRowDiagnostics(run, details) {
  const sql = `INSERT INTO tblPODetails (${detailColumns.join(', ')}) VALUES ?`;
  const values = details.map((row) => detailColumns.map((column) => detailDatabaseValue(column, row[column])));
  try {
    await run(sql, [values]);
    return;
  } catch {
    for (let index = 0; index < details.length; index += 1) {
      try {
        await run(sql, [[values[index]]]);
      } catch (rowError) {
        throw new PurchaseOrderValidationError('A purchase-order line was rejected by the database.', [
          importIssue({
            row: details[index].__excelRow || index + 1,
            field: 'Database validation',
            reason: rowError.message || 'The database rejected this item row.',
          }),
        ]);
      }
    }
  }
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
