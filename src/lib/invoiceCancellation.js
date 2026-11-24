import { withTransaction } from './db';
import { getInvoice } from './invoices';
import { ensureInvoiceCancellationSchema } from './invoiceCancellationSchema';

export async function cancelCustomerInvoice(invoiceId, cancelledBy) {
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) throw new Error('A valid invoice ID is required.');
  await ensureInvoiceCancellationSchema();
  return withTransaction(async run => {
    const [header] = await run('SELECT * FROM tblInvoiceHeader WHERE InvoiceID = ? FOR UPDATE', [invoiceId]);
    if (!header) throw new Error('Invoice not found.');
    if (header.CancelledAt) throw new Error('This invoice is already cancelled.');
    const matches = await run('SELECT InvoiceID FROM tblInvoiceHeader WHERE InvoiceNo = ?', [header.InvoiceNo]);
    if (matches.length !== 1) throw new Error('Resolve duplicate invoice numbers before cancelling.');
    await run('SELECT POBarcode FROM tblPOHeaders WHERE POBarcode = ? FOR UPDATE', [header.POBarcode]);
    await run('SELECT POID FROM tblPODetails WHERE POBarcode = ? ORDER BY POID FOR UPDATE', [header.POBarcode]);
    for (const table of ['webWhitebooksProductionIrn', 'webWhitebooksSandboxIrn']) {
      try {
        const records = await run(`SELECT State FROM ${table} WHERE InvoiceNo = ?`, [header.InvoiceNo]);
        if (records.some(row => ['pending', 'uncertain', 'generated'].includes(String(row.State).toLowerCase()))) {
          throw new Error('Resolve the pending IRN submission before cancelling this invoice.');
        }
      } catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
    }
    const snapshot = await getInvoice(header.InvoiceNo, run);
    const dispatch = await run('SELECT * FROM tblDispatch WHERE InvoiceNo = ? FOR UPDATE', [header.InvoiceNo]);
    await run('INSERT INTO webInvoiceCancellations (InvoiceID, InvoiceNo, SnapshotJson, DispatchJson, CancelledBy) VALUES (?, ?, ?, ?, ?)',
      [invoiceId, header.InvoiceNo, JSON.stringify(snapshot), JSON.stringify(dispatch), String(cancelledBy || '')]);
    // Archive the original dispatch history before releasing active stock consumption.
    await run('DELETE FROM tblDispatch WHERE InvoiceNo = ?', [header.InvoiceNo]);
    await run('UPDATE tblInvoiceHeader SET CancelledAt = NOW() WHERE InvoiceID = ?', [invoiceId]);
    return { invoiceNo: header.InvoiceNo, message: 'Invoice cancelled. Quantities are available again. Cancel it manually on the E-Invoice portal if applicable.' };
  }, { readCommitted: true });
}
