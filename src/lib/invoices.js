import { query } from './db';
import { asNumber } from './format';

const preferredHeaderSql = `
  SELECT h.*
  FROM tblInvoiceHeader h
  JOIN (
    SELECT
      InvoiceNo,
      COALESCE(
        MAX(CASE WHEN InvoiceDate IS NOT NULL THEN InvoiceID END),
        MAX(InvoiceID)
      ) AS PickInvoiceID
    FROM tblInvoiceHeader
    WHERE InvoiceNo = ?
    GROUP BY InvoiceNo
  ) pick ON pick.PickInvoiceID = h.InvoiceID
  LIMIT 1
`;

export async function listInvoices(limit = 100) {
  return query(
    `SELECT
       h.InvoiceID,
       h.InvoiceNo,
       h.InvoiceDate,
       h.GSTN,
       h.POBarcode,
       h.OrderNumber,
       h.OrderDate,
       h.ConsigneeName,
       h.DeliveredToName,
       COALESCE(a.lineCount, 0) AS lineCount,
       COALESCE(a.totalQty, 0) AS totalQty,
       COALESCE(a.taxableAmount, 0) AS taxableAmount
     FROM tblInvoiceHeader h
     JOIN (
       SELECT
         InvoiceNo,
         COALESCE(MAX(CASE WHEN InvoiceDate IS NOT NULL THEN InvoiceID END), MAX(InvoiceID)) AS PickInvoiceID
       FROM tblInvoiceHeader
       WHERE COALESCE(InvoiceNo, '') <> ''
       GROUP BY InvoiceNo
     ) pick ON pick.PickInvoiceID = h.InvoiceID
     LEFT JOIN (
       SELECT
         vd.InvoiceNo,
         COUNT(DISTINCT vd.POID) AS lineCount,
         COALESCE(SUM(vd.DispatchQty), 0) AS totalQty,
         COALESCE(SUM(COALESCE(vd.DispatchQty, 0) * COALESCE(pd.ListPriceFOBTransportExcise, 0)), 0) AS taxableAmount
       FROM vwDispatchDetails vd
       JOIN tblPODetails pd ON pd.POID = vd.POID
       WHERE COALESCE(vd.DispatchNo, '') <> ''
       GROUP BY vd.InvoiceNo
     ) a ON a.InvoiceNo = h.InvoiceNo
     ORDER BY COALESCE(h.InvoiceDate, '1900-01-01') DESC, h.InvoiceID DESC
     LIMIT ?`,
    [Number(limit)]
  );
}

export async function getInvoice(invoiceNo) {
  const headers = await query(preferredHeaderSql, [invoiceNo]);
  const header = headers[0] || null;

  if (!header) {
    return { header: null, lines: [], totals: emptyTotals() };
  }

  const lines = await query(
    `SELECT
       ROW_NUMBER() OVER (ORDER BY pd.POID) AS SlNo,
       pd.POID,
       pd.POBarcode,
       pd.SKUCode,
       pd.StyleId,
       pd.HSNCode,
       pd.VendorArticleName,
       pd.Colour,
       pd.Size,
       SUM(COALESCE(vd.DispatchQty, pd.Quantity, 0)) AS Qty,
       MAX(COALESCE(pd.MRP, 0)) AS MRP,
       MAX(COALESCE(pd.ListPriceFOBTransportExcise, 0)) AS Rate,
       SUM(COALESCE(vd.DispatchQty, pd.Quantity, 0)) * MAX(COALESCE(pd.ListPriceFOBTransportExcise, 0)) AS Amount,
       GROUP_CONCAT(DISTINCT vd.DispatchNo ORDER BY vd.DispatchNo SEPARATOR ', ') AS DispatchNo,
       MAX(poh.POApprovedDate) AS POApprovedDate,
       MAX(poh.VendorGSTIN) AS VendorGSTIN,
       MAX(poh.VendorName) AS VendorName
     FROM vwDispatchDetails vd
     JOIN tblPODetails pd ON pd.POID = vd.POID
     LEFT JOIN tblPOHeaders poh ON poh.POBarcode = pd.POBarcode
     WHERE vd.InvoiceNo = ?
       AND COALESCE(vd.DispatchNo, '') <> ''
     GROUP BY
       pd.POID,
       pd.POBarcode,
       pd.SKUCode,
       pd.StyleId,
       pd.HSNCode,
       pd.VendorArticleName,
       pd.Colour,
       pd.Size
     ORDER BY pd.POID`,
    [invoiceNo]
  );

  return { header, lines, totals: calculateInvoiceTotals(header, lines) };
}

export function calculateInvoiceTotals(header, lines) {
  const totalQty = lines.reduce((sum, line) => sum + asNumber(line.Qty), 0);
  const taxableAmount = lines.reduce((sum, line) => sum + asNumber(line.Amount), 0);
  const isInterState = Boolean(header?.InterStateTax) || (asNumber(header?.IGSTRate) > 0 && !asNumber(header?.SGST) && !asNumber(header?.CGST));
  const igstRate = asNumber(header?.IGSTRate);
  const sgstRate = asNumber(header?.SGST);
  const cgstRate = asNumber(header?.CGST);
  const igstAmount = isInterState ? taxableAmount * igstRate / 100 : 0;
  const sgstAmount = !isInterState ? taxableAmount * sgstRate / 100 : 0;
  const cgstAmount = !isInterState ? taxableAmount * cgstRate / 100 : 0;
  const rawGrandTotal = taxableAmount + igstAmount + sgstAmount + cgstAmount;
  const grandTotal = Math.round(rawGrandTotal);
  const roundOff = grandTotal - rawGrandTotal;

  return {
    totalQty,
    taxableAmount,
    isInterState,
    igstRate,
    igstAmount,
    sgstRate,
    sgstAmount,
    cgstRate,
    cgstAmount,
    roundOff,
    grandTotal,
  };
}

function emptyTotals() {
  return {
    totalQty: 0,
    taxableAmount: 0,
    isInterState: false,
    igstRate: 0,
    igstAmount: 0,
    sgstRate: 0,
    sgstAmount: 0,
    cgstRate: 0,
    cgstAmount: 0,
    roundOff: 0,
    grandTotal: 0,
  };
}
