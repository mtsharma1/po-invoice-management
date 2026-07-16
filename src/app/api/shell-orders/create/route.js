import { createShellOrder } from '@/lib/shellOrders';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { poBarcode } = await request.json();
    const result = await createShellOrder(poBarcode);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
