import { getCurrentSession } from '@/lib/auth';
import { saveMasterDatabaseImage } from '@/lib/master';
import { canAccessFeature, FEATURES } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(request) {
  try {
    const session = await getCurrentSession();
    if (!canAccessFeature(session, FEATURES.PURCHASE_ORDERS)) {
      return Response.json({ ok: false, error: 'Purchase Order access is required.' }, { status: 403 });
    }

    const formData = await request.formData();
    const image = formData.get('image');
    if (!image || typeof image.arrayBuffer !== 'function') {
      throw new Error('Select an image file.');
    }
    if (!allowedTypes.has(String(image.type || '').toLowerCase())) {
      throw new Error('Only JPG, PNG, WebP and GIF images are supported.');
    }

    const result = await saveMasterDatabaseImage({
      poid: formData.get('POID'),
      imageBuffer: Buffer.from(await image.arrayBuffer()),
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
}
