export async function buildRemainingItemsWorkbook(rows) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Teakwood PO & Invoice Web';
  const sheet = workbook.addWorksheet('Remaining items', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'PO ID', key: 'POID', width: 12 },
    { header: 'PO Barcode', key: 'POBarcode', width: 26 },
    { header: 'Style ID', key: 'StyleId', width: 20 },
    { header: 'HSN Code', key: 'HSNCode', width: 16 },
    { header: 'Vendor Article', key: 'VendorArticleName', width: 38 },
    { header: 'Size', key: 'Size', width: 16 },
    { header: 'Colour', key: 'Colour', width: 22 },
    { header: 'MRP', key: 'MRP', width: 16 },
    { header: 'Quantity', key: 'Quantity', width: 16 },
    { header: 'Dispatch Qty', key: 'DispatchQty', width: 16 },
    { header: 'Pending Qty', key: 'PendingQuantity', width: 16 },
  ];
  for (const row of rows) {
    if (Number(row.PendingQuantity) <= 0 || !Number.isFinite(Number(row.PendingQuantity))) continue;
    sheet.addRow({
      ...row,
      MRP: Number(row.MRP || 0),
      Quantity: Number(row.Quantity || 0),
      DispatchQty: Number(row.DispatchQty || 0),
      PendingQuantity: Number(row.PendingQuantity),
    });
  }
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF375A9E' } };
  sheet.getRow(1).height = 24;
  sheet.autoFilter = { from: 'A1', to: `K${sheet.rowCount}` };
  sheet.getColumn('MRP').numFmt = '#,##0.00';
  for (const key of ['Quantity', 'DispatchQty', 'PendingQuantity']) sheet.getColumn(key).numFmt = '#,##0';
  return workbook;
}
