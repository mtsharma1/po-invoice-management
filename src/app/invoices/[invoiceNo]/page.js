import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { DataError } from '@/components/DataState';
import InvoiceView from '@/components/InvoiceView';
import InvoiceQuantityEditor from '@/components/InvoiceQuantityEditor';
import PageHeader from '@/components/PageHeader';
import PrintButton from '@/components/PrintButton';
import { getInvoice } from '@/lib/invoices';
import { getEwayBill } from '@/lib/whitebooksEwayBill';
import { safeData } from '@/lib/safeData';
import { getCurrentSession } from '@/lib/auth';
import { canAccessFeature, FEATURES } from '@/lib/permissions';
import { storedIrn } from '@/lib/invoiceTaxSnapshot';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetailPage({ params }) {
  const { invoiceNo } = await params;
  const decodedInvoiceNo = decodeURIComponent(invoiceNo);
  const { data, error } = await safeData(async () => {
    const invoice = await getInvoice(decodedInvoiceNo);
    if (invoice.header) {
      const bill = await getEwayBill(decodedInvoiceNo, 'production');
      invoice.header.EwayBillNo = bill?.state === 'succeeded' ? bill.result?.EwbNo : '';
    }
    return invoice;
  }, { header: null, lines: [], totals: {} });
  const canEdit = data.header && !storedIrn(data.header.IRN)
    && canAccessFeature(await getCurrentSession(), FEATURES.CUSTOMER_INVOICE);

  return (
    <AppShell>
      <PageHeader eyebrow="Tax Invoice" title={decodedInvoiceNo}>
        <PrintButton />
        <Link className="btn" href={`/api/invoices/${encodeURIComponent(decodedInvoiceNo)}/excel`}>Export Excel</Link>
      </PageHeader>
      <DataError error={error} />
      {canEdit ? <InvoiceQuantityEditor key={decodedInvoiceNo} invoiceNo={decodedInvoiceNo} /> : null}
      <InvoiceView invoice={data} />
    </AppShell>
  );
}
