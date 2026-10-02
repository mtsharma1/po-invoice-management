import { listDispatchEditRows } from '@/lib/dispatch';
import { getDispatchSessionId } from '@/lib/dispatchSession';
import { buildRemainingItemsWorkbook } from '@/lib/excelDispatch';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const poBarcode = new URL(request.url).searchParams.get('poBarcode')?.trim();
    if (!poBarcode) {
      return Response.json({ ok: false, error: 'Please select a purchase order first.' }, { status: 400 });
    }
    const sessionId = await getDispatchSessionId();
    const rows = (await listDispatchEditRows(sessionId, poBarcode)).filter(
      (row) => !row.DispatchNo && Number(row.PendingQuantity) > 0
    );
    if (!rows.length) {
      return Response.json({ ok: false, error: 'No remaining items found. Create a dispatch for the selected PO first.' }, { status: 404 });
    }
    const workbook = await buildRemainingItemsWorkbook(rows);
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = poBarcode.replace(/[^a-z0-9_-]+/gi, '_');
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="RemainingItems_${safeName}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
