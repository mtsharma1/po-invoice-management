import { buildShellOrderExportWorkbook } from '@/lib/shellOrders';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const poBarcode = searchParams.get('poBarcode') || '';
    const workbook = await buildShellOrderExportWorkbook(poBarcode);
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = (poBarcode || 'All').replace(/[^a-z0-9_-]+/gi, '_');

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="ShellOrders_${safeName}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
