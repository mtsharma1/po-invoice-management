import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Dimensions in PDF points, measured from the supplied NIC portal printout.
const PAGE = [594.96, 841.92];
const LEFT = 8.25, VALUE_X = 195.75, RIGHT = 587.25;
export function summarizeHsnItems(items = []) {
  const groups = new Map();
  for (const item of items) {
    const hsn = String(item.hsn ?? '').trim();
    const article = String(item.description ?? '').trim();
    if (!groups.has(hsn)) groups.set(hsn, new Set());
    if (article) groups.get(hsn).add(article);
  }
  return Array.from(groups, ([hsn, articles]) => {
    const first = articles.values().next().value;
    return `${hsn || '-'}${first ? ` - ${first}` : ''}${articles.size > 1 ? ` (+${articles.size - 1})` : ''}`;
  });
}
function fonts() {
  const windows = process.env.WINDIR || 'C:/Windows';
  return [
    [process.env.EWAYBILL_FONT_REGULAR, process.env.EWAYBILL_FONT_BOLD],
    [path.join(windows, 'Fonts/verdana.ttf'), path.join(windows, 'Fonts/verdanab.ttf')],
    ['/usr/share/fonts/truetype/msttcorefonts/Verdana.ttf', '/usr/share/fonts/truetype/msttcorefonts/Verdana_Bold.ttf'],
    ['/usr/share/fonts/truetype/msttcorefonts/verdana.ttf', '/usr/share/fonts/truetype/msttcorefonts/verdanab.ttf'],
  ].find(pair => pair.every(file => file && existsSync(file))) || ['Helvetica', 'Helvetica-Bold'];
}
export function portalDate(value, time = false) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    value = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const raw = String(value).trim();
  const date = raw.match(/^(\d{4})-(\d{2})-(\d{2})/) || raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (!date) return raw;
  const [, a, b, c] = date;
  const formatted = a.length === 4 ? `${c}-${b}-${a}` : `${a}-${b}-${c}`;
  const clock = raw.match(/[T\s](\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!time || !clock) return formatted;
  const hour = Number(clock[1]);
  return `${formatted} ${String(hour % 12 || 12).padStart(2, '0')}:${clock[2]} ${clock[3]?.toUpperCase() || (hour >= 12 ? 'PM' : 'AM')}`;
}
export async function buildEwayBillPdf(data) {
  const [qr, barcode] = await Promise.all([
    QRCode.toBuffer(data.number, { margin: 0, width: 510 }),
    bwipjs.toBuffer({ bcid: 'code128', text: data.number, scale: 4, height: 18, includetext: false, padding: 0 }),
  ]);
  const doc = new PDFDocument({ size: PAGE, margin: 0, bufferPages: true, info: {
    Title: `e-Way Bill ${data.number}`, Author: 'TEAKWOOD',
    Subject: 'Saved-record copy. Reference QR encodes the bill number, not the portal verification payload.',
  } });
  const [regular, bold] = fonts();
  doc.registerFont('Portal', regular); doc.registerFont('PortalBold', bold);
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
  });
  const font = (weight = false, size = 7.5) => doc.font(weight ? 'PortalBold' : 'Portal').fontSize(size);
  const text = (value, x, top, width, weight = false, size = 7.5, extra = {}) => {
    font(weight, size).fillColor('black').text(String(value || ''), x, top, { width, lineGap: 0, ...extra });
  };
  let y = 192;
  const ensure = height => {
    if (y + height <= 780) return;
    doc.addPage(); y = 28;
    text(`e-Way Bill ${data.number} - continued`, LEFT, y, RIGHT - LEFT, true, 10);
    y += 24;
  };
  function rule(top) {
    doc.save().fillColor('#808080').rect(3.75, top, 588, 1.5).fill().restore();
  }
  function section(title) {
    ensure(title === 'Part - B' ? 80 : 42); y -= 1.5; rule(y); y += 3.75;
    text(title, LEFT, y, RIGHT - LEFT, true); y += 13.5;
  }
  function row(label, value, size = 7.5, minHeight = 12) {
    const content = String(value || '-');
    if (content.length > 1200) {
      for (let i = 0; i < content.length; i += 1200) row(i ? '' : label, content.slice(i, i + 1200), size, minHeight);
      return;
    }
    font(true, size);
    const contentHeight = doc.heightOfString(content, { width: RIGHT - VALUE_X, lineGap: 0 });
    font();
    const labelHeight = doc.heightOfString(label, { width: VALUE_X - LEFT - 5, lineGap: 0 });
    const measured = Math.max(contentHeight + 2.5, labelHeight + 2.5);
    const height = Math.max(minHeight, size === 7.5 ? Math.ceil(measured / 3) * 3 : measured);
    ensure(height);
    text(label, LEFT, y + Math.max(0, (contentHeight - labelHeight) / 2) + (size === 13.5 ? 0.75 : 0), VALUE_X - LEFT - 5);
    text(content, VALUE_X, y, RIGHT - VALUE_X, true, size);
    y += height;
  }
  text('e-Way Bill', 0, 27.67, PAGE[0], true, 15, { align: 'center' });
  doc.image(qr, 234, 48.75, { width: 127.5, height: 127.5 });
  if (data.environment === 'sandbox') text('SANDBOX / TEST - NOT FOR TRANSPORT', LEFT, 180, RIGHT - LEFT, true, 8, { align: 'center' });
  else if (data.status && data.status !== 'ACT') text(`PORTAL STATUS: ${data.status}`, LEFT, 180, RIGHT - LEFT, true, 8, { align: 'center' });
  row('E-Way Bill No:', data.number, 13.5, 20.25);
  row('E-Way Bill Date:', portalDate(data.generated, true));
  row('Generated By:', data.generatedBy);
  row('Valid From:', data.validFrom ? `${portalDate(data.validFrom, true)}${Number(data.distance) > 0 ? ` [${data.distance}KM ]` : ''}` : '');
  row('Valid Until:', portalDate(data.validUntil));
  section('IRN Details');
  row('IRN:', data.irn); row('Ack No:', data.ackNo); row('Ack Date:', portalDate(data.ackDate, true));
  section('Part - A');
  row('GSTIN of Supplier', data.supplier); row('Place of Dispatch', data.dispatch);
  row('GSTIN of Recipient', data.recipient); row('Place of Delivery', data.delivery);
  row('Document No.', data.invoiceNo); row('Document Date', portalDate(data.invoiceDate));
  row('Transaction Type:', data.transaction); row('Value of Goods', data.goodsValue?.replaceAll(',', ''));
  if (!data.items.length) row('HSN Code', '');
  for (const summary of summarizeHsnItems(data.items)) row('HSN Code', summary);
  row('Reason for Transportation', data.reason); row('Transporter', data.transporter);
  section('Part - B');
  // NIC uses an outer border and grey top rule, without an internal cell grid.
  const columns = [46.5, 90, 43.5, 96, 123.75, 75, 104.25];
  const headings = ['Mode', 'Vehicle / Trans\nDoc No & Dt.', 'From', 'Entered Date', 'Entered By', 'CEWB No.\n(If any)', 'Multi Veh.Info\n(If any)'];
  const history = Array.isArray(data.vehicleHistory) ? (data.vehicleHistory.length ? data.vehicleHistory : [{}]) : [data];
  const usesEntryDate = entry => !entry.transportDocumentDate && entry.mode === 'Road' && entry.vehicle && entry.vehicleEnteredDate;
  const rows = history.map(entry => {
    const displayedDate = entry.transportDocumentDate || (usesEntryDate(entry) ? entry.vehicleEnteredDate : '');
    const vehicleDocument = `${entry.vehicle || ''}/${entry.transportDocumentNo || ''}`;
    const details = [entry.mode, vehicleDocument === '/' ? '' : vehicleDocument + (displayedDate ? ` & ${portalDate(displayedDate)}${usesEntryDate(entry) ? '*' : ''}` : ''), entry.vehicleFrom, portalDate(entry.vehicleEnteredDate), entry.vehicleEnteredBy, entry.cewbNo, entry.multiVehicleInfo];
    font(false, 6.75);
    return { details, height: Math.max(26.25, ...details.map((value, i) => doc.heightOfString(String(value || '-'), { width: columns[i] - 6, lineGap: 0 }) + 8)) };
  });
  const headerHeight = 27;
  for (let start = 0; start < rows.length;) {
    ensure(headerHeight + rows[start].height + 6);
    const tableTop = y;
    let end = start, tableHeight = headerHeight;
    do { tableHeight += rows[end++].height; } while (end < rows.length && y + tableHeight + rows[end].height <= 780);
    doc.save().lineWidth(0.75).strokeColor('#d5d9df').rect(LEFT, tableTop, RIGHT - LEFT, tableHeight).stroke().restore();
    doc.save().fillColor('#808080').rect(LEFT, tableTop, RIGHT - LEFT, 1.5).fill().restore();
    let x = LEFT;
    for (let i = 0; i < columns.length; i++) {
      const w = columns[i] - 6;
      font(true, 6.75); const hh = doc.heightOfString(headings[i], { width: w });
      text(headings[i], x + 3, tableTop + (headerHeight - hh) / 2, w, true, 6.75);
      let rowY = tableTop + headerHeight;
      for (let n = start; n < end; n++) {
        const value = String(rows[n].details[i] || '-');
        font(false, 6.75); const dh = doc.heightOfString(value, { width: w });
        text(value, x + 3, rowY + (rows[n].height - dh) / 2, w, false, 6.75);
        rowY += rows[n].height;
      }
      x += columns[i];
    }
    y += tableHeight; start = end;
  }
  ensure(111);
  doc.image(barcode, 249, y + 31.31, { width: 97.5, height: 48.27 });
  text(data.number, 249, y + 85.34, 97.5, false, 4.822, { align: 'center' });
  y += 108; rule(y); y += 6;
  const note = [history.some(usesEntryDate) ? '* Vehicle-entry date shown because the transport-document date was not supplied.' : '', data.portalDetails ? 'E-way bill details retrieved from WhiteBooks. QR: bill-number reference only, not the official verification QR. "-": not supplied.' : 'Saved-record copy. QR: bill-number reference only, not the official verification QR. "-": not available in saved records.', ...(data.notes || []).filter(value => value.startsWith('Original'))].filter(Boolean).join(' ');
  font(false, 5.5); ensure(doc.heightOfString(note, { width: 580 }) + 10);
  text(note, LEFT, y, 580, false, 5.5);
  doc.end();
  return result;
}
