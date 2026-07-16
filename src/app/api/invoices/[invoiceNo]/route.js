import { NextResponse } from 'next/server';
import { getInvoice } from '@/lib/invoices';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { invoiceNo } = await params;
  const data = await getInvoice(decodeURIComponent(invoiceNo));
  if (!data.header) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}
