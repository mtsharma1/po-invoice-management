import AppShell from '@/components/AppShell';
import { DataError } from '@/components/DataState';
import PageHeader from '@/components/PageHeader';
import SettingsWorkbench from '@/components/SettingsWorkbench';
import { safeData } from '@/lib/safeData';
import { getSettingsScreenData } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { data, error } = await safeData(
    () => getSettingsScreenData(),
    { settings: {}, templates: [], server: {} }
  );

  return (
    <AppShell>
      <PageHeader eyebrow="System Setup" title="Settings" />
      <DataError error={error} />
      <SettingsWorkbench data={data} />
    </AppShell>
  );
}
