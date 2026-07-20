import AppShell from '@/components/AppShell';
import { DataError } from '@/components/DataState';
import MasterWorkbench from '@/components/MasterWorkbench';
import { getMasterScreenData } from '@/lib/master';
import { safeData } from '@/lib/safeData';

export const dynamic = 'force-dynamic';

export default async function MasterPage({ searchParams }) {
  const params = await searchParams;
  const selectedPO = String(params?.po || '').trim();
  const { data, error } = await safeData(
    () => getMasterScreenData(selectedPO),
    { purchaseOrders: [], rows: [], totalRows: 0, rowLimit: 5000 }
  );

  return (
    <AppShell>
      <DataError error={error} />
      <MasterWorkbench data={data} selectedPO={selectedPO} key={selectedPO || 'all'} />
    </AppShell>
  );
}
