import { invoiceQrBuffer, invoiceQrUrl } from '@/lib/invoiceQr';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const irn = new URL(request.url).searchParams.get('irn');
    const buffer = await invoiceQrBuffer(irn);
    if (!buffer) {
      return Response.json({ error: 'IRN is required.' }, { status: 400 });
    }
    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { irn } = await request.json();
    if (!String(irn || '').trim()) {
      throw new Error('Please enter IRN before generating QR.');
    }

    return Response.json({
      ok: true,
      qrUrl: invoiceQrUrl(irn),
      message: 'Invoice QR code refreshed.',
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
