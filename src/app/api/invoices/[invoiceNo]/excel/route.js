import { getInvoice } from '@/lib/invoices';
import { buildInvoiceWorkbook } from '@/lib/excelInvoice';
import { getEwayBill } from '@/lib/whitebooksEwayBill';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { invoiceNo } = await params;
  const decodedInvoiceNo = decodeURIComponent(invoiceNo);
  const invoice = await getInvoice(decodedInvoiceNo);

  if (!invoice.header) {
    return Response.json({ error: 'Invoice not found' }, { status: 404 });
  }

  // Invoice exports must never include sandbox/test e-way bill numbers.
  const bill = await getEwayBill(decodedInvoiceNo, 'production');
  invoice.header.EwayBillNo = bill?.state === 'succeeded' ? bill.result?.EwbNo : '';
  const workbook = await buildInvoiceWorkbook(invoice);
  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = decodedInvoiceNo.replace(/[^a-z0-9_-]+/gi, '_');

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Invoice_${safeName}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
