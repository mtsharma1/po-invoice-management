import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { DataError, EmptyState } from '@/components/DataState';
import PageHeader from '@/components/PageHeader';
import { dateText, money, qty } from '@/lib/format';
import { listInvoices } from '@/lib/invoices';
import { safeData } from '@/lib/safeData';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const { data: rows, error } = await safeData(() => listInvoices(150), []);

  return (
    <AppShell>
      <PageHeader eyebrow="Billing" title="Invoices" />
      <DataError error={error} />
      {!rows.length && !error ? <EmptyState /> : null}
      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Date</th>
                <th>Order No</th>
                <th>PO</th>
                <th>Consignee</th>
                <th>Delivered To</th>
                <th>Lines</th>
                <th>Qty</th>
                <th>Taxable</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.InvoiceID}>
                  <td><Link href={`/invoices/${encodeURIComponent(row.InvoiceNo)}`}><strong>{row.InvoiceNo}</strong></Link></td>
                  <td>{dateText(row.InvoiceDate)}</td>
                  <td>{row.OrderNumber}</td>
                  <td>{row.POBarcode}</td>
                  <td>{row.ConsigneeName}</td>
                  <td>{row.DeliveredToName}</td>
                  <td className="num">{qty(row.lineCount)}</td>
                  <td className="num">{qty(row.totalQty)}</td>
                  <td className="num">{money(row.taxableAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
