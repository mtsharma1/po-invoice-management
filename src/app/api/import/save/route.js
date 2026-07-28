import { saveStagedPurchaseOrder } from '@/lib/importPO';
import { getImportSessionId } from '@/lib/importSession';
import { recordPOImportErrors } from '@/lib/importLogs';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST() {
  try {
    const sessionId = await getImportSessionId({ create: true });
    const result = await saveStagedPurchaseOrder(sessionId);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    try {
      await recordPOImportErrors([{
        batchId: `SAVE-${Date.now()}`,
        fileName: 'Staged PO',
        field: 'Save to database',
        reason: error.message || 'Save failed.',
        dateTime: new Date(),
      }]);
    } catch {
      // Preserve the original save error if logging is unavailable.
    }
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
