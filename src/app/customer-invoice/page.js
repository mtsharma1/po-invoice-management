import AppShell from '@/components/AppShell';
import CustomerInvoiceWorkbench from '@/components/CustomerInvoiceWorkbench';
import { DataError } from '@/components/DataState';
import PageHeader from '@/components/PageHeader';
import { getCustomerInvoiceScreenData } from '@/lib/customerInvoice';
import { safeData } from '@/lib/safeData';

export const dynamic = 'force-dynamic';

export default async function CustomerInvoicePage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const invoiceNo = resolvedSearchParams?.new ? '' : resolvedSearchParams?.invoiceNo || '';
  const search = resolvedSearchParams?.search || '';
  const { data, error } = await safeData(
    () => getCustomerInvoiceScreenData({ invoiceNo, search }),
    { rows: [], selectedInvoice: {}, search }
  );

  return (
    <AppShell>
      <PageHeader eyebrow="" title="CUSTOMER INVOICES" />
      <DataError error={error} />
      <CustomerInvoiceWorkbench
        rows={data.rows}
        selectedInvoice={data.selectedInvoice}
        selectedInvoiceNo={invoiceNo}
        search={data.search}
      />
    </AppShell>
  );
}
