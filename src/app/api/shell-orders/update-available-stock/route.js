import { refreshAvailableStockFromTranzact } from '@/lib/shellOrders';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST() {
  try {
    const result = await refreshAvailableStockFromTranzact();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
