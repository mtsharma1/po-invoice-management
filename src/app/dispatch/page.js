import AppShell from '@/components/AppShell';
import { DataError } from '@/components/DataState';
import DispatchWorkbench from '@/components/DispatchWorkbench';
import PageHeader from '@/components/PageHeader';
import { getDispatchScreenData } from '@/lib/dispatch';
import { getDispatchSessionId } from '@/lib/dispatchSession';
import { safeData } from '@/lib/safeData';

export const dynamic = 'force-dynamic';

export default async function DispatchPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const selectedPO = resolvedSearchParams?.poBarcode || '';
  const mode = resolvedSearchParams?.mode || 'selected';
  const sessionId = await getDispatchSessionId();
  const { data, error } = await safeData(
    () => getDispatchScreenData({ poBarcode: selectedPO, sessionId, mode }),
    { poOptions: [], poContext: null, rows: [], mode }
  );

  return (
    <AppShell>
      <PageHeader eyebrow="Purchase Order Dispatch" title="Dispatch" />
      <DataError error={error} />
      <DispatchWorkbench
        poOptions={data.poOptions}
        selectedPO={selectedPO}
        poContext={data.poContext}
        rows={data.rows}
        mode={data.mode || mode}
      />
    </AppShell>
  );
}
