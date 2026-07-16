export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { irn } = await request.json();
    if (!String(irn || '').trim()) {
      throw new Error('Please enter IRN before generating QR.');
    }

    return Response.json({
      ok: true,
      message: 'QR preview refreshed. The invoice print layout uses the QR image from public/qr.png.',
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
