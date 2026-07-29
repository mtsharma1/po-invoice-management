import { query } from './db';
import { ensurePOImportDateColumn } from './poSchema';

export async function listPurchaseOrders(limit = 100) {
  await ensurePOImportDateColumn();

  return query(
    `SELECT
       h.POBarcode,
       h.POApprovedDate,
       h.POImportDate,
       h.PurchaseType,
       h.EstimatedDeliveryDate,
       h.VendorName,
       h.VendorGSTIN,
       h.Party,
       COUNT(d.POID) AS skuCount,
       COALESCE(SUM(d.Quantity), 0) AS totalQty,
       COALESCE(SUM(COALESCE(d.Quantity, 0) * COALESCE(d.ListPriceFOBTransportExcise, 0)), 0) AS totalValue
     FROM tblPOHeaders h
     LEFT JOIN tblPODetails d ON d.POBarcode = h.POBarcode
     GROUP BY h.POBarcode, h.POApprovedDate, h.POImportDate, h.PurchaseType, h.EstimatedDeliveryDate, h.VendorName, h.VendorGSTIN, h.Party
     ORDER BY COALESCE(h.POImportDate, h.CreatedOn, h.POApprovedDate) DESC, h.POBarcode DESC
     LIMIT ?`,
    [Number(limit)]
  );
}

export async function getPurchaseOrder(poBarcode) {
  await ensurePOImportDateColumn();

  const headers = await query('SELECT * FROM tblPOHeaders WHERE POBarcode = ? LIMIT 1', [poBarcode]);
  const lines = await query(
    `SELECT *
     FROM tblPODetails
     WHERE POBarcode = ?
     ORDER BY POID`,
    [poBarcode]
  );

  return { header: headers[0] || null, lines };
}
