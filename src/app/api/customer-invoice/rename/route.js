import { getCurrentSession } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { renameInvoiceReferences } from '@/lib/invoiceNumber';
import { canEditInvoice } from '@/lib/permissions';
import { isSameOriginRequest } from '@/lib/requestOrigin';

export async function PATCH(request) {
  if (!canEditInvoice(await getCurrentSession()) || !isSameOriginRequest(request)) {
    return Response.json({ error: 'Customer invoice access and a matching request origin are required.' }, { status: 403 });
  }
  try {
    const body = await request.json();
    const invoiceId = Number(body.invoiceId);
    const invoiceNo = String(body.invoiceNo ?? '').trim();
    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0 || !invoiceNo) throw new Error('A valid invoice and new invoice number are required.');
    await withTransaction(async run => {
      const [saved] = await run('SELECT InvoiceNo, IRN, CancelledAt FROM tblInvoiceHeader WHERE InvoiceID = ? FOR UPDATE', [invoiceId]);
      if (!saved) throw new Error('Invoice not found.');
      if (saved.CancelledAt) throw new Error('Cancelled invoices cannot be renamed.');
      if (saved.InvoiceNo !== body.previousNumber) throw new Error('Invoice number changed. Refresh the invoice list.');
      const duplicate = await run('SELECT InvoiceID FROM tblInvoiceHeader WHERE LOWER(TRIM(InvoiceNo)) = LOWER(?) AND InvoiceID <> ? LIMIT 1 FOR UPDATE', [invoiceNo, invoiceId]);
      if (duplicate.length) throw new Error('This invoice number already exists. Use a different number.');
      await renameInvoiceReferences(run, saved, invoiceNo);
      await run('UPDATE tblInvoiceHeader SET InvoiceNo = ? WHERE InvoiceID = ?', [invoiceNo, invoiceId]);
    }, { invoiceNumberLock: true });
    return Response.json({ ok: true, invoiceNo });
  } catch (error) {
    console.error('Invoice rename failed', error);
    return Response.json({ error: error.code ? 'Unable to rename invoice. No changes were saved.' : error.message }, { status: 400 });
  }
}
