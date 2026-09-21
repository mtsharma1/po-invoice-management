import { getCurrentSession } from '@/lib/auth';
import { prepareEInvoice } from '@/lib/eInvoice';
import { canAccessFeature, FEATURES } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getCurrentSession();
    if (!canAccessFeature(session, FEATURES.E_INVOICE)) {
      return Response.json({ ok: false, error: 'You do not have permission to prepare e-invoices.' }, { status: 403 });
    }
    const payload = await request.json();
    const result = await prepareEInvoice(payload?.invoiceNo, payload?.draft);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || 'E-invoice preparation failed.' }, { status: 500 });
  }
}
