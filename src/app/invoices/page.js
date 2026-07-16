import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { DataError, EmptyState } from '@/components/DataState';
import PageHeader from '@/components/PageHeader';
import { dateText, money, qty } from '@/lib/format';
import { listInvoices } from '@/lib/invoices';
import { safeData } from '@/lib/safeData';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const search = String(resolvedSearchParams?.search || '').trim();
  const { data: rows, error } = await safeData(() => listInvoices(150), []);
  const normalizedSearch = search.toLowerCase();
  const displayRows = normalizedSearch
    ? rows.filter((row) => [
        row.InvoiceNo,
        row.OrderNumber,
        row.POBarcode,
        row.ConsigneeName,
        row.DeliveredToName,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)))
    : rows;

  return (
    <AppShell>
      <PageHeader eyebrow="Billing & Reports" title="Invoice Reports" />
      <DataError error={error} />
      <section className="invoice-report-panel">
        <div className="invoice-report-heading">
          <div>
            <p>Invoice archive</p>
            <h2>Customer invoices</h2>
            <span>Search, review and open printable customer invoice records.</span>
          </div>
          <Link className="invoice-create-link" href="/customer-invoice?new=1">＋ Create invoice</Link>
        </div>

        <form className="invoice-report-toolbar" method="get">
          <label>
            <span>Search invoices</span>
            <input name="search" defaultValue={search} placeholder="Invoice, PO, order or consignee" />
          </label>
          <button type="submit">Search</button>
          {search ? <Link href="/invoices">Clear</Link> : null}
          <small>{displayRows.length} record{displayRows.length === 1 ? '' : 's'}</small>
        </form>

        {!displayRows.length && !error ? (
          <EmptyState title="No invoices found" body={search ? 'Try a different invoice, PO, order or consignee.' : 'There are no invoice records to show yet.'} />
        ) : null}

        {displayRows.length ? <div className="invoice-report-table-wrap">
          <table className="invoice-report-table">
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
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.InvoiceID}>
                  <td><Link className="invoice-number-link" href={`/invoices/${encodeURIComponent(row.InvoiceNo)}`}>{row.InvoiceNo}</Link></td>
                  <td>{dateText(row.InvoiceDate)}</td>
                  <td>{row.OrderNumber}</td>
                  <td>{row.POBarcode}</td>
                  <td>{row.ConsigneeName}</td>
                  <td>{row.DeliveredToName}</td>
                  <td className="num"><span className="invoice-line-badge">{qty(row.lineCount)}</span></td>
                  <td className="num">{qty(row.totalQty)}</td>
                  <td className="num">{money(row.taxableAmount)}</td>
                  <td><Link className="invoice-row-action" href={`/invoices/${encodeURIComponent(row.InvoiceNo)}`}>View →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div> : null}
      </section>
    </AppShell>
  );
}
