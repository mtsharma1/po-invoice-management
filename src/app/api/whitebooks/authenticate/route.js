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

    if (request.headers.get('origin') !== new URL(request.url).origin) {
      return json({ ok: false, error: 'A same-origin request is required.' }, 403);
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
