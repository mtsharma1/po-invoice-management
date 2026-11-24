import { cancelCustomerInvoice } from '@/lib/invoiceCancellation';
import { getCurrentSession } from '@/lib/auth';
import { canAccessFeature, FEATURES } from '@/lib/permissions';
import { isSameOriginRequest } from '@/lib/requestOrigin';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const session = await getCurrentSession();
  if (!canAccessFeature(session, FEATURES.CUSTOMER_INVOICE) || !isSameOriginRequest(request)) {
    return Response.json({ ok: false, error: 'Invoice access and a same-origin request are required.' }, { status: 403 });
  }
  try {
    const payload = await request.json();
    if (payload.confirmed !== true) throw new Error('Confirm cancellation before continuing.');
    const result = await cancelCustomerInvoice(payload.invoiceId, session.username || session.userId || session.name);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 409 });
  }
}
