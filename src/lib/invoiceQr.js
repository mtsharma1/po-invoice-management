function qrValue(headerOrValue) {
  if (typeof headerOrValue === 'object' && headerOrValue) {
    return String(headerOrValue.IRN || headerOrValue.InvoiceNo || '').trim();
  }
  return String(headerOrValue || '').trim();
}

const qrOptions = {
  errorCorrectionLevel: 'M',
  margin: 1,
  width: 220,
  color: { dark: '#000000', light: '#FFFFFF' },
};

export async function invoiceQrBuffer(headerOrValue) {
  const value = qrValue(headerOrValue);
  if (!value) return null;
  const { default: QRCode } = await import('qrcode');
  return QRCode.toBuffer(value, { ...qrOptions, type: 'png' });
}

export function invoiceQrUrl(headerOrValue) {
  const value = qrValue(headerOrValue);
  return value ? `/api/customer-invoice/qr?irn=${encodeURIComponent(value)}` : '/qr.png';
}
