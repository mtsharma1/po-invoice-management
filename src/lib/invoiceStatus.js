export function invoiceStatus(invoice) {
  if (invoice.CancelledAt) return 'Cancelled';
  const irn = String(invoice.IRN ?? '').trim().toLowerCase();
  return irn && !['null', 'undefined'].includes(irn) ? 'IRN Generated' : 'IRN Not Generated';
}
