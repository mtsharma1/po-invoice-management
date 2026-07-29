import { getCurrentSession } from '@/lib/auth';
import { getMasterDatabaseImage } from '@/lib/master';
import { canAccessFeature, FEATURES } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const session = await getCurrentSession();
    if (!canAccessFeature(session, FEATURES.PURCHASE_ORDERS)) {
      return Response.json({ ok: false, error: 'Purchase Order access is required.' }, { status: 403 });
    }
    const { poid } = await params;
    const image = await getMasterDatabaseImage(
      poid,
      request.nextUrl.searchParams.get('index')
    );
    return new Response(image, {
      headers: {
        'Content-Type': detectImageType(image),
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 404 });
  }
}

function detectImageType(buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp';
  return 'application/octet-stream';
}
