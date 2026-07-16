import { stagePurchaseOrderWorkbook } from '@/lib/importPO';
import { getImportSessionId } from '@/lib/importSession';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) throw new Error('Please select a purchase order Excel file.');

    const sessionId = await getImportSessionId({ create: true });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await stagePurchaseOrderWorkbook(sessionId, fileBuffer);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
