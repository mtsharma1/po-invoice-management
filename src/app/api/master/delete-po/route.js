import { getCurrentSession } from '@/lib/auth';
import { deleteMasterPurchaseOrder } from '@/lib/master';
import { canAccessFeature, FEATURES } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getCurrentSession();
    if (!canAccessFeature(session, FEATURES.PURCHASE_ORDERS)) {
      return Response.json({ ok: false, error: 'Purchase Order access is required.' }, { status: 403 });
    }
    const { poBarcode } = await request.json();
    const result = await deleteMasterPurchaseOrder(poBarcode);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
}
