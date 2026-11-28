import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth';
import { canEditInvoice } from '@/lib/permissions';
import AppShell from '@/components/AppShell';
import InvoiceQuantityEditor from '@/components/InvoiceQuantityEditor';
import InvoiceView from '@/components/InvoiceView';
import { dateText, money, qty } from '@/lib/format';
import { getInvoice } from '@/lib/invoices';
import { getInvoiceQuantityOptions, InvoiceQuantityError } from '@/lib/invoiceQuantities';

export const dynamic = 'force-dynamic';

const backHref = '/customer-invoice';

export default async function CustomerInvoiceEditPage({ params }) {
  if (!canEditInvoice(await getCurrentSession())) redirect('/customer-invoice');
  const { invoiceNo } = await params;
  const number = decodeURIComponent(invoiceNo);
  const invoice = await getInvoice(number);
  if (!invoice.header) notFound();
  const { header, totals } = invoice;

  let items;
  let editError;
  try {
    items = await getInvoiceQuantityOptions(number);
  } catch (error) {
    if (!(error instanceof InvoiceQuantityError)) throw error;
    editError = error.message;
  }

  return (
    <AppShell>
      <div className="customer-invoice-edit-page">
        <header className="customer-invoice-edit-header">
          <div className="customer-invoice-edit-identity">
            <nav aria-label="Breadcrumb"><Link href={backHref}>Customer invoices</Link><span aria-hidden="true">/</span><span aria-current="page">Edit invoice</span></nav>
            <h1>{header.InvoiceNo}</h1>
          </div>
          <dl>
            <div><dt>PO barcode</dt><dd>{header.POBarcode || '—'}</dd></div>
            <div><dt>Invoice date</dt><dd>{dateText(header.InvoiceDate) || '—'}</dd></div>
            <div><dt>Invoice quantity</dt><dd>{qty(totals.totalQty)}</dd></div>
            <div><dt>Grand total</dt><dd>₹{money(totals.grandTotal)}</dd></div>
          </dl>
        </header>
        {editError ? <p className="invoice-quantity-feedback error" role="alert">{editError}</p> : null}
        {items ? <InvoiceQuantityEditor invoiceNo={header.InvoiceNo} initialItems={items} backHref={backHref} /> : null}
        <section className="customer-invoice-edit-preview" aria-labelledby="invoice-preview-title">
          <h2 id="invoice-preview-title">Invoice details</h2>
          <InvoiceView invoice={invoice} />
        </section>
      </div>
    </AppShell>
  );
}
