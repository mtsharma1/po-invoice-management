import { readFile } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const fileName = 'PO Upload Template.xlsx';
    const candidatePaths = [
      process.env.PO_UPLOAD_TEMPLATE_PATH,
      path.resolve(process.cwd(), 'templates', fileName),
      path.resolve(process.cwd(), 'public', 'templates', fileName),
      path.resolve(process.cwd(), '..', '..', fileName),
      path.resolve(process.cwd(), '..', fileName),
    ].filter(Boolean);

    let buffer;
    for (const templatePath of candidatePaths) {
      try {
        buffer = await readFile(templatePath);
        break;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }

    if (!buffer) {
      buffer = await buildDefaultPOTemplate();
    }

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

async function buildDefaultPOTemplate() {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Teakwood PO & Invoice Web';

  const worksheet = workbook.addWorksheet('Purchase Order', {
    views: [{ state: 'frozen', ySplit: 9, showGridLines: false }],
  });

  const detailHeaders = [
    'SKU Id',
    'Style Id',
    'SKU Code',
    'HSN Code',
    'Brand',
    'GTIN',
    'Vendor Article Number',
    'Vendor Article Name',
    'Size',
    'Colour',
    'Mrp',
    'Credit Period',
    'Margin Type',
    'Agreed Margin',
    'Gross Margin',
    'Quantity',
    'FOB Amount',
    'List price(FOB+Transport-Excise)',
    'Landing Price',
    'Estimated Delivery Date',
    'Tax BCD',
    'Tax BCD Amount',
    'Buying Tax IGST',
    'Buying Tax IGST Amount',
    'Tax SWT',
    'Tax SWT Amount',
    'Selling Tax CGST',
    'Selling Tax CGST Amount',
    'Selling Tax IGST',
    'Selling Tax IGST Amount',
    'Selling Tax SGST',
    'Selling Tax SGST Amount',
  ];

  const sampleDetail = [
    94199992,
    29321766,
    'TWLTTRBA94199992',
    '42021250',
    'Teakwood Leathers',
    '00042451111120',
    'T_TR_INDIA_B1_G7616_01',
    'T_TR_INDIA_B1_G7616_01',
    'S',
    'Grey',
    8199,
    null,
    'GROSS_UP',
    84.14,
    84.14,
    5,
    null,
    1102,
    1300.36,
    '05/06/2026',
    0,
    0,
    18,
    198.36,
    0,
    0,
    9,
    625.35,
    0,
    0,
    9,
    625.35,
  ];

  worksheet.columns = detailHeaders.map((header) => ({
    width: Math.min(34, Math.max(12, header.length + 3)),
  }));
  worksheet.getColumn(7).width = 27;
  worksheet.getColumn(8).width = 27;
  worksheet.getColumn(18).width = 34;

  worksheet.mergeCells('A1:AF1');
  worksheet.getCell('A1').value = 'Purchase Order 📄';
  worksheet.getCell('A1').font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF355C8A' } };
  worksheet.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' };
  worksheet.getRow(1).height = 28;

  writeHeaderField(worksheet, 'A2', 'B2:C2', 'PO Barcode', 'MYNJ-TEAK210426-6');
  writeHeaderField(worksheet, 'A3', 'B3:C3', 'PO Approved Date', '21/04/2026');
  writeHeaderField(worksheet, 'A4', 'B4:C4', 'Purchase Type', 'OUTRIGHT');
  writeHeaderField(worksheet, 'A5', 'B5:C5', 'Estimated Delivery Date', '05/06/2026');
  writeHeaderField(worksheet, 'A6', 'B6:C6', 'Vendor Name', 'TEAKWOOD');
  writeHeaderField(worksheet, 'A7', 'B7:C7', 'Vendor GSTIN', '06BMTPS4959L1ZX');

  writeHeaderField(
    worksheet,
    'D2',
    'E2:AF2',
    'Bill To',
    'Warehouse Building Nos. WE-II , Renaissance Integrated Industrial Area, Village Vashere, Bhiwandi,Thane , Mumbai , Maharashtra - 421302,Bhiwandi,Maharashtra,421302'
  );
  writeHeaderField(
    worksheet,
    'D4',
    'E4:AF4',
    'Ship To',
    'Warehouse Building Nos. WE-II , Renaissance Integrated Industrial Area, Village Vashere, Bhiwandi,Thane , Mumbai , Maharashtra - 421302,Bhiwandi,Maharashtra,421302'
  );
  writeHeaderField(
    worksheet,
    'D6',
    'E6:AF6',
    'Vendor Address',
    'Plot no.11, Street no. 2, Sector-4, Model Econonic Township, Dadri Toe, jhajjar,Jhajjar,Haryana,124103'
  );

  worksheet.getRow(9).values = detailHeaders;
  worksheet.getRow(10).values = sampleDetail;
  worksheet.getRow(9).height = 34;
  worksheet.getRow(9).eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder('FF9DB2CE');
  });
  worksheet.getRow(10).eachCell((cell, columnNumber) => {
    cell.font = { name: 'Calibri', size: 10 };
    cell.alignment = {
      horizontal: columnNumber >= 11 && columnNumber !== 13 ? 'right' : 'left',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = thinBorder('FFD9E2F3');
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function writeHeaderField(worksheet, labelCell, valueRange, label, value) {
  worksheet.getCell(labelCell).value = label;
  worksheet.getCell(labelCell).font = { name: 'Calibri', size: 10, bold: true };
  worksheet.getCell(labelCell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF8' } };
  worksheet.getCell(labelCell).alignment = { vertical: 'middle' };
  worksheet.getCell(labelCell).border = thinBorder('FFD5DDE8');

  worksheet.mergeCells(valueRange);
  const valueCell = worksheet.getCell(valueRange.split(':')[0]);
  valueCell.value = value;
  valueCell.font = { name: 'Calibri', size: 10 };
  valueCell.alignment = { vertical: 'middle', wrapText: true };
  valueCell.border = thinBorder('FFD5DDE8');
}

function thinBorder(argb) {
  const edge = { style: 'thin', color: { argb } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}
