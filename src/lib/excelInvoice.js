import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { dateText, dateTimeText, money, text } from './format';

const borderThin = { style: 'thin', color: { argb: 'FF000000' } };
const borderMedium = { style: 'medium', color: { argb: 'FF000000' } };

export async function buildInvoiceWorkbook({ header, lines, totals }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Teakwood PO & Invoice Web';
  workbook.created = new Date();

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

  writeTopBlock(ws, header);
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

  const totalsStart = lastLineRow + 2;
  writeTotals(ws, totalsStart, totals, header);
  writeFooter(ws, totalsStart + 7, header);

  const printLastRow = totalsStart + 15;
  ws.pageSetup.printArea = `A1:K${printLastRow}`;
  ws.pageSetup.printTitlesRow = `${itemHeaderRow}:${itemHeaderRow}`;

  for (let row = 1; row <= printLastRow; row += 1) {
    ws.getRow(row).height = ws.getRow(row).height || 18;
    ws.getRow(row).font = { name: 'Arial', size: 8, bold: row <= itemHeaderRow };
  }

  return workbook;
}

function writeTopBlock(ws, header) {
  mergeValue(ws, 'A1:I1', `IRN : ${text(header.IRN)}`, 'left', true);
  mergeValue(ws, 'A2:I2', `Ack No. : ${text(header.AckNo)}`, 'left', true);
  mergeValue(ws, 'A3:I3', `Ack Date : ${dateTimeText(header.AckDate)}`, 'left', true);
  mergeValue(ws, 'A4:I4', '', 'left', false);
  ws.mergeCells('J1:K4');
  ws.getCell('J1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('J1').value = 'QR';
  ws.getCell('J1').font = { name: 'Arial', size: 9, bold: true };
  box(ws, 'A1:K4', borderMedium);

  const qrPath = path.join(process.cwd(), 'public', 'qr.png');
  if (fs.existsSync(qrPath)) {
    const imageId = ws.workbook.addImage({ filename: qrPath, extension: 'png' });
    ws.addImage(imageId, 'J1:K4');
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
  row.height = 18;
}

function writeTotals(ws, startRow, totals, header) {
  mergeValue(ws, `A${startRow}:G${startRow}`, '', 'left');
  ws.getCell(`H${startRow}`).value = 'TOTAL QTY';
  ws.getCell(`I${startRow}`).value = totals.totalQty;
  ws.getCell(`I${startRow}`).numFmt = '#,##0';
  ws.getCell(`H${startRow}`).font = bold();
  ws.getCell(`I${startRow}`).font = bold();

  const amountCol = 'J';
  const valueCol = 'K';
  setTotalLine(ws, startRow + 1, amountCol, valueCol, 'TAXABLE AMOUNT', totals.taxableAmount);
  if (totals.isInterState) {
    setTotalLine(ws, startRow + 2, amountCol, valueCol, `IGST ${money(totals.igstRate, 0)}%`, totals.igstAmount);
    setTotalLine(ws, startRow + 3, amountCol, valueCol, 'ROUND OFF', totals.roundOff);
    setTotalLine(ws, startRow + 4, amountCol, valueCol, 'GRAND TOTAL', totals.grandTotal);
  } else {
    setTotalLine(ws, startRow + 2, amountCol, valueCol, `SGST ${money(totals.sgstRate, 0)}%`, totals.sgstAmount);
    setTotalLine(ws, startRow + 3, amountCol, valueCol, `CGST ${money(totals.cgstRate, 0)}%`, totals.cgstAmount);
    setTotalLine(ws, startRow + 4, amountCol, valueCol, 'ROUND OFF', totals.roundOff);
    setTotalLine(ws, startRow + 5, amountCol, valueCol, 'GRAND TOTAL', totals.grandTotal);
  }

  const wordsRow = startRow + 6;
  mergeValue(ws, `A${wordsRow}:G${wordsRow}`, text(header.TotalInWords), 'center', true);
}

function setTotalLine(ws, rowNumber, labelCol, valueCol, label, value) {
  ws.getCell(`${labelCol}${rowNumber}`).value = label;
  ws.getCell(`${labelCol}${rowNumber}`).font = bold();
  ws.getCell(`${valueCol}${rowNumber}`).value = Number(value || 0);
  ws.getCell(`${valueCol}${rowNumber}`).numFmt = '#,##0.00';
  ws.getCell(`${valueCol}${rowNumber}`).font = bold();
  ws.getCell(`${valueCol}${rowNumber}`).alignment = { horizontal: 'right' };
  ws.getCell(`${labelCol}${rowNumber}`).alignment = { horizontal: 'left' };
  ws.getCell(`${labelCol}${rowNumber}`).border = allBorders(borderThin);
  ws.getCell(`${valueCol}${rowNumber}`).border = allBorders(borderThin);
}

function writeFooter(ws, startRow, header) {
  ws.getCell(`H${startRow}`).value = 'ACCOUNT NO.';
  ws.getCell(`K${startRow}`).value = text(header.AccountNo);
  ws.getCell(`H${startRow + 1}`).value = 'BANK NAME';
  ws.getCell(`K${startRow + 1}`).value = text(header.BankName);
  ws.getCell(`H${startRow + 2}`).value = 'Branch';
  ws.getCell(`K${startRow + 2}`).value = text(header.BranchName);
  ws.getCell(`H${startRow + 3}`).value = 'IFSC CODE';
  ws.getCell(`K${startRow + 3}`).value = text(header.IFSCCode);
  for (let row = startRow; row <= startRow + 3; row += 1) {
    ws.getCell(`H${row}`).font = bold();
    ws.getCell(`K${row}`).font = bold();
    ws.getCell(`K${row}`).alignment = { horizontal: 'right' };
  }
  mergeValue(ws, `J${startRow + 8}:K${startRow + 8}`, 'FOR TEAKWOOD', 'center', true);
  mergeValue(ws, `J${startRow + 9}:K${startRow + 9}`, 'AUTH. SIGN', 'center', false);
}

function mergeValue(ws, range, value, horizontal = 'left', boldText = false, size = 8) {
  ws.mergeCells(range);
  const cell = ws.getCell(range.split(':')[0]);
  cell.value = value;
  cell.alignment = { horizontal, vertical: 'middle', wrapText: true };
  cell.font = { name: 'Arial', size, bold: boldText };
  box(ws, range, borderThin);
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
