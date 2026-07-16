import AppShell from '@/components/AppShell';
import { DataError, EmptyState } from '@/components/DataState';
import PageHeader from '@/components/PageHeader';
import { dateText, money, qty, text } from '@/lib/format';
import { getPurchaseOrder } from '@/lib/purchaseOrders';
import { safeData } from '@/lib/safeData';

export const dynamic = 'force-dynamic';

export default async function PurchaseOrderDetailPage({ params }) {
  const { poBarcode } = await params;
  const decodedPO = decodeURIComponent(poBarcode);
  const { data, error } = await safeData(() => getPurchaseOrder(decodedPO), { header: null, lines: [] });

  return (
    <AppShell>
      <PageHeader eyebrow="PO Detail" title={decodedPO} />
      <DataError error={error} />
      {!data.header && !error ? <EmptyState title="PO not found" /> : null}
      {data.header ? (
        <section className="panel">
          <p><strong>Vendor:</strong> {text(data.header.VendorName)} | <strong>GSTIN:</strong> {text(data.header.VendorGSTIN)} | <strong>Approved:</strong> {dateText(data.header.POApprovedDate)}</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>POID</th>
                  <th>SKU Code</th>
                  <th>Style</th>
                  <th>HSN</th>
                  <th>Vendor Article</th>
                  <th>Colour</th>
                  <th>Size</th>
                  <th>Qty</th>
                  <th>MRP</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={line.POID}>
                    <td>{line.POID}</td>
                    <td>{line.SKUCode}</td>
                    <td>{line.StyleId}</td>
                    <td>{line.HSNCode}</td>
                    <td>{line.VendorArticleName}</td>
                    <td>{line.Colour}</td>
                    <td>{line.Size}</td>
                    <td className="num">{qty(line.Quantity)}</td>
                    <td className="num">{money(line.MRP)}</td>
                    <td className="num">{money(line.ListPriceFOBTransportExcise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
