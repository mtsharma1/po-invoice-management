import { isSameOriginRequest } from '@/lib/requestOrigin';
import { getCurrentSession } from '@/lib/auth';
import { canAccessFeature, FEATURES } from '@/lib/permissions';
import { generateEwayBill, getEwayBill } from '@/lib/whitebooksEwayBill';
import { WhitebooksError, getEwayBillEnvironment } from '@/lib/whitebooks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function handle(request, generate) {
  try {
    if (!canAccessFeature(await getCurrentSession(), FEATURES.E_INVOICE)) {
      return json({ ok: false, error: 'E-invoice access is required.' }, 403);
    }
    if (generate && !isSameOriginRequest(request)) {
      return json({ ok: false, error: 'Request origin does not match this app. Set APP_ORIGIN on the server to the exact browser origin (including port), then restart the app.' }, 403);
    }
    let payload;
    try { payload = generate ? await request.json() : { invoiceNo: new URL(request.url).searchParams.get('invoiceNo') }; }
    catch { return json({ ok: false, error: 'Invalid JSON request.' }, 400); }
    const invoiceNo = typeof payload?.invoiceNo === 'string' ? payload.invoiceNo.trim() : '';
    if (!invoiceNo || invoiceNo.length > 255) return json({ ok: false, error: 'A valid invoice number is required.' }, 400);
    const environment = getEwayBillEnvironment();
    const result = generate
      ? await generateEwayBill(invoiceNo, payload.transport, payload.draft, environment)
      : { ok: true, submission: await getEwayBill(invoiceNo, environment) };
    return json({ ...result, environment }, result.ok ? 200 : 422);
  } catch (error) {
    return json({ ok: false, error: error instanceof WhitebooksError ? error.message : 'Unable to complete the request. Refresh the submission status before trying again.' }, 502);
  }
}

export const GET = (request) => handle(request, false);
export const POST = (request) => handle(request, true);
