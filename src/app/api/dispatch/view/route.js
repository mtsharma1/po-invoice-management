import { createDispatchDraft } from '@/lib/dispatch';
import { getDispatchSessionId } from '@/lib/dispatchSession';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { poBarcode } = await request.json();
    const sessionId = await getDispatchSessionId({ create: true });
    const result = await createDispatchDraft(poBarcode, sessionId, { view: true });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
