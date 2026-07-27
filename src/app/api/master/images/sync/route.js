import { getCurrentSession } from '@/lib/auth';
import { syncMissingMasterImages } from '@/lib/master';
import { canAccessFeature, FEATURES } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  try {
    const session = await getCurrentSession();
    if (!canAccessFeature(session, FEATURES.PURCHASE_ORDERS)) {
      return Response.json({ ok: false, error: 'Purchase Order access is required.' }, { status: 403 });
    }
    const result = await syncMissingMasterImages();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
}
