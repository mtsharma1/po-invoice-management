import { query, withTransaction } from './db';

const editableLineFields = Object.freeze({
  StyleId: 'StyleId',
  SKUCode: 'SKUCode',
  HSNCode: 'HSNCode',
  Brand: 'Brand',
  GTIN: 'GTIN',
  VendorArticleNumber: 'VendorArticleNumber',
  VendorArticleName: 'VendorArticleName',
  Size: 'Size',
  Colour: 'Colour',
  MRP: 'MRP',
  Quantity: 'Quantity',
  Rate: 'ListPriceFOBTransportExcise',
  LandingPrice: 'LandingPrice',
  EstimatedDeliveryDate: 'EstimatedDeliveryDate',
  FactoryDispatchDate: 'FactoryDispatchDate',
});

export async function getMasterScreenData(poBarcode = '') {
  const selectedPO = String(poBarcode || '').trim();
  const where = selectedPO ? 'WHERE d.POBarcode = ?' : '';
  const params = selectedPO ? [selectedPO] : [];

  const [purchaseOrders, countRows, rows] = await Promise.all([
    query(
      `SELECT h.POBarcode, COUNT(d.POID) AS lineCount, COALESCE(SUM(d.Quantity), 0) AS totalQty
       FROM tblPOHeaders h
       LEFT JOIN tblPODetails d ON d.POBarcode = h.POBarcode
       GROUP BY h.POBarcode
       ORDER BY COALESCE(MAX(h.CreatedOn), MAX(h.POApprovedDate)) DESC, h.POBarcode DESC`
    ),
    query(
      `SELECT COUNT(*) AS totalRows
       FROM tblPODetails d
       ${where}`,
      params
    ),
    query(
      `SELECT
         d.POID,
         d.POBarcode,
         d.StyleId,
         d.SKUCode,
         d.HSNCode,
         d.Brand,
         d.GTIN,
         d.VendorArticleNumber,
         d.VendorArticleName,
         d.Size,
         d.Colour,
         d.MRP,
         d.Quantity,
         d.ListPriceFOBTransportExcise AS Rate,
         d.LandingPrice,
         d.EstimatedDeliveryDate,
         h.BillTo,
         h.ShipTo,
         d.FactoryDispatchDate
       FROM tblPODetails d
       INNER JOIN tblPOHeaders h ON h.POBarcode = d.POBarcode
       ${where}
       ORDER BY d.POBarcode DESC, d.POID
       LIMIT 5000`,
      params
    ),
  ]);

  return {
    purchaseOrders,
    rows,
    totalRows: Number(countRows[0]?.totalRows || 0),
    rowLimit: 5000,
  };
}

export async function saveMasterLine(payload) {
  const poid = Number(payload?.POID || 0);
  if (!Number.isInteger(poid) || poid <= 0) throw new Error('A valid PO line is required.');

  return withTransaction(async (run) => {
    const currentRows = await run(
      'SELECT POBarcode FROM tblPODetails WHERE POID = ? LIMIT 1 FOR UPDATE',
      [poid]
    );
    if (!currentRows.length) throw new Error('The selected PO line no longer exists.');

    const assignments = [];
    const values = [];
    for (const [payloadField, column] of Object.entries(editableLineFields)) {
      assignments.push(`\`${column}\` = ?`);
      values.push(normalizeMasterValue(payloadField, payload?.[payloadField]));
    }
    assignments.push('ModifiedDate = NOW()');
    values.push(poid);

    await run(
      `UPDATE tblPODetails SET ${assignments.join(', ')} WHERE POID = ?`,
      values
    );

    await run(
      `UPDATE tblPOHeaders SET BillTo = ?, ShipTo = ? WHERE POBarcode = ?`,
      [String(payload?.BillTo || ''), String(payload?.ShipTo || ''), currentRows[0].POBarcode]
    );

    return { message: `PO line ${poid} updated successfully.` };
  });
}

export async function deleteMasterPurchaseOrder(poBarcode) {
  const value = String(poBarcode || '').trim();
  if (!value) throw new Error('Please select a purchase order to delete.');

  return withTransaction(async (run) => {
    const headers = await run(
      'SELECT POBarcode FROM tblPOHeaders WHERE POBarcode = ? LIMIT 1 FOR UPDATE',
      [value]
    );
    if (!headers.length) throw new Error('The selected purchase order no longer exists.');

    const shellResult = await run('DELETE FROM tblShellOrders WHERE POBarcode = ?', [value]);
    const dispatchResult = await run('DELETE FROM tblDispatch WHERE POBarcode = ?', [value]);
    const detailResult = await run('DELETE FROM tblPODetails WHERE POBarcode = ?', [value]);
    await run('DELETE FROM tblPOHeaders WHERE POBarcode = ?', [value]);

    return {
      message: `Purchase order ${value} deleted successfully.`,
      deleted: {
        shellOrders: shellResult.affectedRows,
        dispatchRows: dispatchResult.affectedRows,
        poLines: detailResult.affectedRows,
      },
    };
  });
}

function normalizeMasterValue(field, value) {
  if (field === 'MRP' || field === 'Rate' || field === 'LandingPrice') {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number < 0) throw new Error(`${field} must be a valid non-negative number.`);
    return number;
  }
  if (field === 'Quantity') {
    const number = Number(value || 0);
    if (!Number.isInteger(number) || number < 0) throw new Error('Quantity must be a valid non-negative whole number.');
    return number;
  }
  if (field === 'EstimatedDeliveryDate' || field === 'FactoryDispatchDate') {
    return value ? String(value).slice(0, 10) : null;
  }
  return String(value || '').trim();
}
