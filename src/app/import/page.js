import AppShell from '@/components/AppShell';
import { DataError } from '@/components/DataState';
import ImportWorkbench from '@/components/ImportWorkbench';
import PageHeader from '@/components/PageHeader';
import { getImportScreenData } from '@/lib/importPO';
import { getImportSessionId } from '@/lib/importSession';
import { safeData } from '@/lib/safeData';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const sessionId = await getImportSessionId();
  const { data, error } = await safeData(
    () => getImportScreenData(sessionId),
    { header: {}, rows: [] }
  );

  return (
    <AppShell>
      {/* <PageHeader eyebrow="Excel Import" title="Import" /> */}
      <DataError error={error} />
      <ImportWorkbench header={data.header} rows={data.rows} />
    </AppShell>
  );
}
