import { getPOImportErrorLogs } from '@/lib/importLogs';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const limit = new URL(request.url).searchParams.get('limit');
    const logs = await getPOImportErrorLogs(limit);
    return Response.json({ ok: true, logs });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || 'Unable to load the PO import error log.' }, { status: 500 });
  }
}
