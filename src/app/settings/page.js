import AppShell from '@/components/AppShell';
import { DataError } from '@/components/DataState';
import PageHeader from '@/components/PageHeader';
import SettingsWorkbench from '@/components/SettingsWorkbench';
import { safeData } from '@/lib/safeData';
import { getSettingsScreenData } from '@/lib/settings';
import { getCurrentSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getCurrentSession();
  if (!session?.admin) redirect('/dashboard');

  const { data, error } = await safeData(
    () => getSettingsScreenData(),
    { users: [], accessTypes: [] }
  );

  return (
    <AppShell>
      <PageHeader eyebrow="ADMINISTRATOR" title="SETTINGS" />
      <DataError error={error} />
      <SettingsWorkbench data={data} />
    </AppShell>
  );
}
