import { getCurrentSession } from '@/lib/auth';
import { getInvoiceQuantityOptions, InvoiceQuantityError, updateInvoiceQuantities } from '@/lib/invoiceQuantities';
import { canAccessFeature, FEATURES } from '@/lib/permissions';
import { isSameOriginRequest } from '@/lib/requestOrigin';

export const dynamic = 'force-dynamic';

async function handle(request, params, save) {
  if (!canAccessFeature(await getCurrentSession(), FEATURES.CUSTOMER_INVOICE)) {
    return Response.json({ error: 'Customer invoice access is required.' }, { status: 403 });
  }
  if (save && !isSameOriginRequest(request)) {
    return Response.json({ error: 'Request origin does not match this app.' }, { status: 403 });
  }
  try {
    const { invoiceNo } = await params;
    const number = decodeURIComponent(invoiceNo);
    if (!save) return Response.json({ items: await getInvoiceQuantityOptions(number) });
    const body = await request.json();
    await updateInvoiceQuantities(number, body?.changes);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof InvoiceQuantityError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError || error instanceof URIError) {
      return Response.json({ error: 'Invalid invoice quantity request.' }, { status: 400 });
    }
    console.error('Invoice quantity request failed', error);
    return Response.json({ error: 'Unable to complete the invoice quantity request.' }, { status: 500 });
  }
}

export const GET = (request, { params }) => handle(request, params, false);
export const PATCH = (request, { params }) => handle(request, params, true);
