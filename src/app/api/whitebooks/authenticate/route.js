import { isSameOriginRequest } from '@/lib/requestOrigin';
import { getCurrentSession } from '@/lib/auth';
import { authenticateWhitebooks, WhitebooksError, getEInvoiceEnvironment } from '@/lib/whitebooks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  try {
    const session = await getCurrentSession();
    if (!session?.admin) return json({ ok: false, error: 'Administrator access is required.' }, 403);

    if (!isSameOriginRequest(request)) {
      return json({ ok: false, error: 'Request origin does not match this app. Set APP_ORIGIN on the server to the exact browser origin (including port), then restart the app.' }, 403);
    }

    await authenticateWhitebooks();
    return json({ ok: true, message: `WhiteBooks ${getEInvoiceEnvironment()} authentication succeeded.` });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof WhitebooksError ? error.message : 'WhiteBooks authentication could not be completed.',
    }, 502);
  }
}
