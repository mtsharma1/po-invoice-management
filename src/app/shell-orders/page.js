import AppShell from '@/components/AppShell';
import { DataError } from '@/components/DataState';
import PageHeader from '@/components/PageHeader';
import ShellOrderWorkbench from '@/components/ShellOrderWorkbench';
import { safeData } from '@/lib/safeData';
import { getShellOrderScreenData } from '@/lib/shellOrders';

export const dynamic = 'force-dynamic';

export default async function ShellOrdersPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const selectedPO = resolvedSearchParams?.poBarcode || '';
  const { data, error } = await safeData(
    () => getShellOrderScreenData(selectedPO),
    { poOptions: [], poContext: null, rows: [] }
  );

  return (
    <AppShell>
      <PageHeader eyebrow="Shell Order Dispatch" title="Shell Orders" />
      <DataError error={error} />
      <ShellOrderWorkbench
        poOptions={data.poOptions}
        selectedPO={selectedPO}
        poContext={data.poContext}
        rows={data.rows}
      />
    </AppShell>
  );
}
