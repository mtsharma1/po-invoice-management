import { saveCustomerInvoice } from '@/lib/customerInvoice';
import { getCurrentSession } from '@/lib/auth';
import { canAccessFeature, canEditInvoice, FEATURES } from '@/lib/permissions';
import { isSameOriginRequest } from '@/lib/requestOrigin';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const session = await getCurrentSession();
  if (!canAccessFeature(session, FEATURES.CUSTOMER_INVOICE) || !isSameOriginRequest(request)) {
    return Response.json({ ok: false, error: 'Customer invoice access and a matching request origin are required.' }, { status: 403 });
  }
  try {
    const payload = await request.json();
    if (Number(payload?.InvoiceID) && !canEditInvoice(session)) return Response.json({ ok: false, error: 'Only admins can edit invoice details.' }, { status: 403 });
    const result = await saveCustomerInvoice(payload);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
