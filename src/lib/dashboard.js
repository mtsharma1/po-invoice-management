import { query } from './db';

export async function getDashboardStats() {
  const [poRows, skuRows, dispatchRows, invoiceRows] = await Promise.all([
    query('SELECT COUNT(*) AS totalPOs, MAX(CreatedOn) AS lastPODate FROM tblPOHeaders'),
    query('SELECT COUNT(*) AS totalSKUs, COALESCE(SUM(Quantity), 0) AS totalPOQty FROM tblPODetails'),
    query("SELECT COUNT(*) AS dispatchRows, COALESCE(SUM(DispatchQty), 0) AS dispatchedQty FROM tblDispatch WHERE COALESCE(DispatchNo, '') <> ''"),
    query('SELECT COUNT(DISTINCT InvoiceNo) AS invoices, MAX(InvoiceDate) AS lastInvoiceDate FROM tblInvoiceHeader'),
  ]);

  return {
    purchaseOrders: poRows[0] || {},
    sku: skuRows[0] || {},
    dispatch: dispatchRows[0] || {},
    invoices: invoiceRows[0] || {},
  };
}
