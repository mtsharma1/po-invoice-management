import AppShell from '@/components/AppShell';
import EInvoiceWorkbench from '@/components/EInvoiceWorkbench';
import { DataError } from '@/components/DataState';
import PageHeader from '@/components/PageHeader';
import { getEInvoiceScreenData } from '@/lib/eInvoice';
import { safeData } from '@/lib/safeData';

export const dynamic = 'force-dynamic';

export default async function EInvoicePage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const invoiceNo = String(resolvedSearchParams?.invoiceNo || '');
  const search = String(resolvedSearchParams?.search || '');
  const fallback = { rows: [], draft: null, validation: null, search };
  const { data, error } = await safeData(
    () => getEInvoiceScreenData({ invoiceNo, search }),
    fallback
  );

  return (
    <AppShell>
      <PageHeader eyebrow="GST / IRP" title="E-Invoice JSON" />
      <DataError error={error} />
      <EInvoiceWorkbench
        rows={data.rows}
        initialDraft={data.draft}
        initialValidation={data.validation}
        selectedInvoiceNo={invoiceNo}
        search={data.search}
      />
    </AppShell>
  );
}
