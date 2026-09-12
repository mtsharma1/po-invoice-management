import { getCurrentSession } from '@/lib/auth';
import { canAccessFeature, FEATURES } from '@/lib/permissions';
import { generateSandboxIrn, getSandboxIrn } from '@/lib/whitebooksIrn';
import { WhitebooksError } from '@/lib/whitebooks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function handle(request, generate) {
  try {
    if (!canAccessFeature(await getCurrentSession(), FEATURES.E_INVOICE)) {
      return json({ ok: false, error: 'E-invoice access is required.' }, 403);
    }
    if (generate && request.headers.get('origin') !== new URL(request.url).origin) {
      return json({ ok: false, error: 'A same-origin request is required.' }, 403);
    }
    let payload;
    try { payload = generate ? await request.json() : { invoiceNo: new URL(request.url).searchParams.get('invoiceNo') }; }
    catch { return json({ ok: false, error: 'Invalid JSON request.' }, 400); }
    const invoiceNo = typeof payload?.invoiceNo === 'string' ? payload.invoiceNo.trim() : '';
    if (!invoiceNo || invoiceNo.length > 255) return json({ ok: false, error: 'A valid invoice number is required.' }, 400);
    const result = generate
      ? await generateSandboxIrn(invoiceNo, payload.draft)
      : { ok: true, submission: await getSandboxIrn(invoiceNo) };
    return json(result, result.ok ? 200 : 422);
  } catch (error) {
    return json({ ok: false, error: error instanceof WhitebooksError ? error.message : 'Unable to complete the request. Refresh the submission status before trying again.' }, 502);
  }
}

export const GET = (request) => handle(request, false);
export const POST = (request) => handle(request, true);
