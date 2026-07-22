import { dateText, dateTimeText, text } from './format.js';
import { invoiceQrBuffer } from './invoiceQr.js';

const borderThin = { style: 'thin', color: { argb: 'FF000000' } };
const borderMedium = { style: 'medium', color: { argb: 'FF000000' } };

export async function buildInvoiceWorkbook({ header, lines, totals }) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Teakwood PO & Invoice Web';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;

  const ws = workbook.addWorksheet('Invoice', {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.25,
        bottom: 0.35,
        header: 0.1,
        footer: 0.1,
      },
    },
    views: [{ showGridLines: false }],
  });

  ws.columns = [
    { key: 'sl', width: 5 },
    { key: 'sku', width: 18 },
    { key: 'style', width: 12 },
    { key: 'hsn', width: 12 },
    { key: 'name', width: 30 },
    { key: 'color', width: 14 },
    { key: 'size', width: 10 },
    { key: 'qty', width: 8 },
    { key: 'mrp', width: 11 },
    { key: 'rate', width: 12 },
    { key: 'amount', width: 14 },
  ];

  ws.getColumn('qty').numFmt = '#,##0';
  ['mrp', 'rate', 'amount'].forEach((key) => {
    ws.getColumn(key).numFmt = '#,##0.00';
  });

  await writeTopBlock(ws, header);
  writePartyBlocks(ws, header);
  const itemHeaderRow = 18;
  writeItemHeader(ws, itemHeaderRow);
  const firstLineRow = itemHeaderRow + 1;
  lines.forEach((line, index) => writeItemLine(ws, firstLineRow + index, line, index + 1));

  const lastLineRow = Math.max(firstLineRow, firstLineRow + lines.length - 1);
  if (lines.length === 0) {
    ws.mergeCells(`A${firstLineRow}:K${firstLineRow}`);
    ws.getCell(`A${firstLineRow}`).value = 'No invoice lines found';
    ws.getCell(`A${firstLineRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorder(ws.getRow(firstLineRow), borderThin);
  }

  const totalsStart = lastLineRow + 1;
  const totalsLayout = writeTotals(ws, totalsStart, totals, header, firstLineRow, lastLineRow);
  writeFooter(ws, totalsLayout.footerStart, header);

  const printLastRow = totalsLayout.footerStart + 10;
  ws.pageSetup.printArea = `A1:K${printLastRow}`;
  ws.pageSetup.printTitlesRow = `${itemHeaderRow}:${itemHeaderRow}`;

  for (let row = 1; row <= printLastRow; row += 1) {
    ws.getRow(row).height = ws.getRow(row).height || 18;
    ws.getRow(row).font = { name: 'Arial', size: 8, bold: row <= itemHeaderRow };
  }

  return workbook;
}

async function writeTopBlock(ws, header) {
  mergeValue(ws, 'A1:I1', `IRN : ${text(header.IRN)}`, 'left', true);
  mergeValue(ws, 'A2:I2', `Ack No. : ${text(header.AckNo)}`, 'left', true);
  mergeValue(ws, 'A3:I3', `Ack Date : ${dateTimeText(header.AckDate)}`, 'left', true);
  mergeValue(ws, 'A4:I4', '', 'left', false);
  ws.mergeCells('J1:K4');
  ws.getCell('J1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('J1').value = 'QR';
  ws.getCell('J1').font = { name: 'Arial', size: 9, bold: true };
  box(ws, 'A1:K4', borderMedium);

  const qrBuffer = await invoiceQrBuffer(header);
  if (qrBuffer) {
    const imageId = ws.workbook.addImage({ buffer: qrBuffer, extension: 'png' });
    ws.addImage(imageId, {
      tl: {
        nativeCol: 9,
        nativeColOff: 495300,
        nativeRow: 0,
        nativeRowOff: 38100,
      },
      br: {
        nativeCol: 10,
        nativeColOff: 485775,
        nativeRow: 3,
        nativeRowOff: 190500,
      },
      editAs: 'oneCell',
    });
    ws.getCell('J1').value = '';
  }

  mergeValue(ws, 'A5:K5', 'TAX INVOICE', 'center', true, 12);
  mergeValue(ws, 'A6:E6', `INVOICE NO: ${text(header.InvoiceNo)}`, 'center', true, 10);
  mergeValue(ws, 'F6:K6', `DATE-  ${dateText(header.InvoiceDate)}`, 'center', true, 10);
  box(ws, 'A5:K6', borderMedium);
}

function writePartyBlocks(ws, header) {
  mergeValue(ws, 'A7:E7', 'BILL FROM', 'center', true);
  mergeValue(ws, 'F7:K7', 'DISPATCH FROM', 'center', true);
  writeAddress(ws, 'A8:E12', header.BillFromName, header.BillFromAddress);
  writeAddress(ws, 'F8:K12', header.DispatchFromName, header.DispatchFromAddress, [
    header.OrderNumber ? `ORDER NO: ${header.OrderNumber}` : '',
    header.OrderDate ? `ORDER DATE- ${dateText(header.OrderDate)}` : '',
    header.SealNo ? `SEAL NO : ${header.SealNo}` : '',
  ]);

  mergeValue(ws, 'A13:E13', 'CONSIGNEE', 'center', true);
  mergeValue(ws, 'F13:K13', 'DELIVERED TO', 'center', true);
  writeAddress(ws, 'A14:E17', header.ConsigneeName, header.ConsigneeAddress);
  writeAddress(ws, 'F14:K17', header.DeliveredToName, header.DeliveredToAddress);
  box(ws, 'A7:K17', borderMedium);
}

function writeAddress(ws, range, name, address, extraLines = []) {
  ws.mergeCells(range);
  const cell = ws.getCell(range.split(':')[0]);
  cell.value = [text(name), text(address), ...extraLines.filter(Boolean)].filter(Boolean).join('\n');
  cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  cell.font = { name: 'Arial', size: 8, bold: true };
  box(ws, range, borderThin);
}

function writeItemHeader(ws, rowNumber) {
  const headers = ['Sl.No.', 'SKU CODE', 'Style Id', 'HSN CODE', 'VENDOR ARTICLE NAME', 'COLOR', 'SIZE', 'QTY', 'MRP', 'RATE', 'AMOUNT'];
  const row = ws.getRow(rowNumber);
  headers.forEach((label, index) => {
    const cell = row.getCell(index + 1);
    cell.value = label;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.font = { name: 'Arial', size: 8, bold: true };
    cell.border = allBorders(borderMedium);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F3F3' } };
  });
  row.height = 21;
}

function writeItemLine(ws, rowNumber, line, slNo) {
  const row = ws.getRow(rowNumber);
  row.values = [
    slNo,
    text(line.SKUCode),
    text(line.StyleId),
    text(line.HSNCode),
    text(line.VendorArticleName),
    text(line.Colour),
    text(line.Size),
    Number(line.Qty || 0),
    Number(line.MRP || 0),
    Number(line.Rate || 0),
    Number(line.Amount || 0),
  ];
  row.eachCell((cell, colNumber) => {
    cell.alignment = {
      horizontal: colNumber >= 8 ? 'right' : colNumber === 5 ? 'left' : 'center',
      vertical: 'middle',
      wrapText: true,
    };
    cell.font = { name: 'Arial', size: 8, bold: true };
    cell.border = allBorders(borderThin);
  });
  row.getCell(11).value = {
    formula: `ROUND(H${rowNumber}*J${rowNumber},2)`,
    result: Number(line.Amount || 0),
  };
  row.getCell(11).numFmt = '#,##0.00';
  row.height = 18;
}

function writeTotals(ws, startRow, totals, header, firstLineRow, lastLineRow) {
  const taxableRow = startRow + 1;
  const firstTaxRow = startRow + 2;
  const taxRowCount = totals.isInterState ? 2 : 1;
  const lastTaxRow = firstTaxRow + taxRowCount - 1;
  const roundRow = lastTaxRow + 1;
  const grandRow = roundRow + 1;
  const wordsRow = grandRow + 2;

  ws.getCell(`G${startRow}`).value = 'TOTAL QTY';
  ws.getCell(`G${startRow}`).font = bold();
  ws.getCell(`H${startRow}`).value = {
    formula: `SUM(H${firstLineRow}:H${lastLineRow})`,
    result: Number(totals.totalQty || 0),
  };
  ws.getCell(`H${startRow}`).numFmt = '#,##0';
  ws.getCell(`H${startRow}`).font = bold();

  setFormulaTotalLine(ws, taxableRow, 'TAXABLE AMOUNT', `SUM(K${firstLineRow}:K${lastLineRow})`, totals.taxableAmount);
  if (totals.isInterState) {
    setTaxLine(ws, firstTaxRow, 'CGST', totals.cgstRate, taxableRow, totals.cgstAmount);
    setTaxLine(ws, firstTaxRow + 1, 'SGST', totals.sgstRate, taxableRow, totals.sgstAmount);
  } else {
    setTaxLine(ws, firstTaxRow, 'IGST', totals.igstRate, taxableRow, totals.igstAmount);
  }
  setFormulaTotalLine(
    ws,
    roundRow,
    'ROUND OFF',
    `ROUND(SUM(K${taxableRow}:K${lastTaxRow}),0)-SUM(K${taxableRow}:K${lastTaxRow})`,
    totals.roundOff
  );
  setFormulaTotalLine(ws, grandRow, 'GRAND TOTAL', `SUM(K${taxableRow}:K${roundRow})`, totals.grandTotal, true);

  mergeValue(ws, `A${wordsRow}:K${wordsRow}`, text(header.TotalInWords), 'center', true, 9);
  ws.getCell(`A${wordsRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F5' } };
  ws.getRow(wordsRow).height = 22;

  return { footerStart: wordsRow + 3 };
}

function setFormulaTotalLine(ws, rowNumber, label, formula, result, emphasize = false) {
  mergeValue(ws, `H${rowNumber}:J${rowNumber}`, label, 'left', true);
  const valueCell = ws.getCell(`K${rowNumber}`);
  valueCell.value = { formula, result: Number(result || 0) };
  valueCell.numFmt = '#,##0.00';
  valueCell.font = bold();
  valueCell.alignment = { horizontal: 'right', vertical: 'middle' };
  valueCell.border = allBorders(borderThin);
  if (emphasize) box(ws, `H${rowNumber}:K${rowNumber}`, borderThin);
}

function setTaxLine(ws, rowNumber, label, rate, taxableRow, amount) {
  mergeValue(ws, `H${rowNumber}:I${rowNumber}`, label, 'left', true);
  const rateCell = ws.getCell(`J${rowNumber}`);
  rateCell.value = Number(rate || 0) / 100;
  rateCell.numFmt = '0.##%';
  rateCell.font = bold();
  rateCell.alignment = { horizontal: 'right', vertical: 'middle' };
  rateCell.border = allBorders(borderThin);

  const valueCell = ws.getCell(`K${rowNumber}`);
  valueCell.value = {
    formula: `ROUND(K${taxableRow}*J${rowNumber},2)`,
    result: Number(amount || 0),
  };
  valueCell.numFmt = '#,##0.00';
  valueCell.font = bold();
  valueCell.alignment = { horizontal: 'right', vertical: 'middle' };
  valueCell.border = allBorders(borderThin);
}

function writeFooter(ws, startRow, header) {
  const details = [
    ['ACCOUNT NO.', header.AccountNo],
    ['BANK NAME', header.BankName],
    ['BRANCH', header.BranchName],
    ['IFSC CODE', header.IFSCCode],
  ];
  details.forEach(([label, value], index) => {
    const row = startRow + index;
    mergeValue(ws, `H${row}:I${row}`, label, 'left', true, 8, false);
    mergeValue(ws, `J${row}:K${row}`, text(value), 'right', true, 8, false);
    ws.getCell(`J${row}`).numFmt = '@';
  });
  box(ws, `H${startRow}:K${startRow + 3}`, borderThin);
  mergeValue(ws, `J${startRow + 9}:K${startRow + 9}`, 'FOR TEAKWOOD', 'center', true, 8, false);
  mergeValue(ws, `J${startRow + 10}:K${startRow + 10}`, 'AUTH. SIGN', 'center', false, 8, false);
  box(ws, `J${startRow + 9}:K${startRow + 10}`, borderThin);
}

function mergeValue(ws, range, value, horizontal = 'left', boldText = false, size = 8, withBorder = true) {
  ws.mergeCells(range);
  const cell = ws.getCell(range.split(':')[0]);
  cell.value = value;
  cell.alignment = { horizontal, vertical: 'middle', wrapText: true };
  cell.font = { name: 'Arial', size, bold: boldText };
  if (withBorder) box(ws, range, borderThin);
}

function box(ws, range, border) {
  const [start, end] = range.split(':');
  const startCell = ws.getCell(start);
  const endCell = ws.getCell(end);
  for (let row = startCell.row; row <= endCell.row; row += 1) {
    for (let col = startCell.col; col <= endCell.col; col += 1) {
      ws.getCell(row, col).border = allBorders(border);
    }
  }
}

function applyBorder(row, border) {
  row.eachCell((cell) => {
    cell.border = allBorders(border);
  });
}

function allBorders(border) {
  return { top: border, left: border, bottom: border, right: border };
}

function bold() {
  return { name: 'Arial', size: 8, bold: true };
}
