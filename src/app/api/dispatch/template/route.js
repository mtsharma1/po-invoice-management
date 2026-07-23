import { readFile } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const fileName = 'Dispatch Upload Template.xlsx';
    const buffer = await loadDispatchTemplate(fileName);

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

async function loadDispatchTemplate(fileName) {
  const candidatePaths = [
    process.env.DISPATCH_UPLOAD_TEMPLATE_PATH,
    path.resolve(process.cwd(), 'templates', fileName),
    path.resolve(process.cwd(), 'public', 'templates', fileName),
    path.resolve(process.cwd(), '..', fileName),
    path.resolve(process.cwd(), '..', '..', fileName),
  ].filter(Boolean);

  for (const templatePath of candidatePaths) {
    try {
      return await readFile(templatePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  return buildDefaultDispatchTemplate();
}

async function buildDefaultDispatchTemplate() {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Teakwood PO & Invoice Web';

  const worksheet = workbook.addWorksheet('Sheet1', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });

  worksheet.columns = [
    { key: 'POBarcode', width: 24 },
    { key: 'VendorArticleName', width: 36 },
    { key: 'DispatchQty', width: 16 },
  ];

  worksheet.addTable({
    name: 'DispatchUploadTemplate',
    ref: 'A1',
    headerRow: true,
    style: {
      theme: 'TableStyleMedium2',
      showRowStripes: true,
    },
    columns: [
      { name: 'POBarcode' },
      { name: 'VendorArticleName' },
      { name: 'DispatchQty' },
    ],
    rows: [
      ['MYNJ-TEAK210426-1', 'T_TR_INDIA_B1_BL_02', 40],
      ['MYNJ-TEAK210426-1', 'T_TR_CONCENTRIX_B1_GR_01', 15],
      ['MYNJ-TEAK210426-1', 'T_TR_INDIA_B1_BL_123', 3],
      ['MYNJ-TEAK210426-1', 'T_TR_INDIA_B1_RS_123', 11],
    ],
  });

  worksheet.getRow(1).height = 22;
  worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getColumn('DispatchQty').numFmt = '0';

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
