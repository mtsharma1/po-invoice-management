import { uploadDispatchFile } from '@/lib/dispatch';
import { getDispatchSessionId } from '@/lib/dispatchSession';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const selectedPO = String(formData.get('poBarcode') || '').trim();
    if (!file) throw new Error('Please select a file to import.');

    const sessionId = await getDispatchSessionId({ create: true });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadDispatchFile({ sessionId, selectedPO, fileBuffer });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
