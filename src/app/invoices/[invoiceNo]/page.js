import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { DataError } from '@/components/DataState';
import InvoiceView from '@/components/InvoiceView';
import PageHeader from '@/components/PageHeader';
import PrintButton from '@/components/PrintButton';
import { getInvoice } from '@/lib/invoices';
import { safeData } from '@/lib/safeData';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetailPage({ params }) {
  const { invoiceNo } = await params;
  const decodedInvoiceNo = decodeURIComponent(invoiceNo);
  const { data, error } = await safeData(() => getInvoice(decodedInvoiceNo), { header: null, lines: [], totals: {} });

  return (
    <AppShell>
      <PageHeader eyebrow="Tax Invoice" title={decodedInvoiceNo}>
        <PrintButton />
        <Link className="btn" href={`/api/invoices/${encodeURIComponent(decodedInvoiceNo)}/excel`}>Export Excel</Link>
      </PageHeader>
      <div className="invoice-toolbar">
        <strong>{decodedInvoiceNo}</strong>
        <div className="action-row">
          <Link className="btn secondary" href="/invoices">Back</Link>
          <Link className="btn" href={`/api/invoices/${encodeURIComponent(decodedInvoiceNo)}/excel`}>Download Excel</Link>
        </div>
      </div>
      <DataError error={error} />
      <InvoiceView invoice={data} />
    </AppShell>
  );
}
