import { getCurrentSession } from '@/lib/auth';
import { canAccessFeature, FEATURES } from '@/lib/permissions';
import { getEwayBillEnvironment, WhitebooksError } from '@/lib/whitebooks';
import { getEwayBillPdfData } from '@/lib/ewayBillPdfSource';
import { buildEwayBillPdf } from '@/lib/ewayBillPdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!canAccessFeature(await getCurrentSession(), FEATURES.E_INVOICE)) {
    return Response.json({ error: 'E-invoice access is required.' }, { status: 403, headers });
  }
  const params = new URL(request.url).searchParams;
  const invoiceNo = (params.get('invoiceNo') || '').trim();
  if (!invoiceNo || invoiceNo.length > 255) return Response.json({ error: 'A valid invoice number is required.' }, { status: 400, headers });
  const environment = getEwayBillEnvironment();
  if (params.get('environment') !== environment) return Response.json({ error: 'The environment changed. Refresh the invoice before downloading.' }, { status: 409, headers });
  try {
    const data = await getEwayBillPdfData(invoiceNo, environment);
    const buffer = await buildEwayBillPdf(data);
    return new Response(buffer, { headers: {
      ...headers, 'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${environment}-EwayBill-${data.number}.pdf"`,
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    if (error instanceof WhitebooksError) return Response.json({ error: error.message }, { status: 502, headers });
    const expected = /required|before downloading|not found|do not match/i.test(error.message);
    return Response.json({ error: expected ? error.message : 'Unable to build the e-way bill PDF. Check the saved bill and invoice records.' }, { status: expected ? 422 : 500, headers });
  }
}
