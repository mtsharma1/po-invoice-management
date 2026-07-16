import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { DataError, EmptyState } from '@/components/DataState';
import PageHeader from '@/components/PageHeader';
import { dateText, money, qty } from '@/lib/format';
import { listPurchaseOrders } from '@/lib/purchaseOrders';
import { safeData } from '@/lib/safeData';

export const dynamic = 'force-dynamic';

export default async function PurchaseOrdersPage() {
  const { data: rows, error } = await safeData(() => listPurchaseOrders(150), []);

  return (
    <AppShell>
      <PageHeader eyebrow="Myntra PO" title="Purchase Orders" />
      <DataError error={error} />
      {!rows.length && !error ? <EmptyState /> : null}
      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>PO Barcode</th>
                <th>Approved</th>
                <th>Vendor</th>
                <th>GSTIN</th>
                <th>SKUs</th>
                <th>Qty</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.POBarcode}>
                  <td><Link href={`/purchase-orders/${encodeURIComponent(row.POBarcode)}`}><strong>{row.POBarcode}</strong></Link></td>
                  <td>{dateText(row.POApprovedDate)}</td>
                  <td>{row.VendorName}</td>
                  <td>{row.VendorGSTIN}</td>
                  <td className="num">{qty(row.skuCount)}</td>
                  <td className="num">{qty(row.totalQty)}</td>
                  <td className="num">{money(row.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
