import { saveStagedPurchaseOrder } from '@/lib/importPO';
import { getImportSessionId } from '@/lib/importSession';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST() {
  try {
    const sessionId = await getImportSessionId({ create: true });
    const result = await saveStagedPurchaseOrder(sessionId);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
