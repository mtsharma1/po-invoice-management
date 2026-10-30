import { query } from './db';
import { lineTaxRates } from './invoiceTax';

export const storedIrn = value => ['null', 'undefined'].includes(String(value ?? '').trim().toLowerCase()) ? '' : String(value ?? '').trim().toLowerCase();
const money = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

export async function ensureInvoiceTaxSnapshots() {
  await query(`CREATE TABLE IF NOT EXISTS webInvoiceTaxSnapshots (
    InvoiceID BIGINT NOT NULL PRIMARY KEY, InvoiceNo VARCHAR(255) NOT NULL,
    IRN VARCHAR(64) NULL, SnapshotJson LONGTEXT NOT NULL,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

function ratesFromItem(item, preferred, withoutPayment = false) {
  if (withoutPayment) return {taxRate:Number(item.GstRt || 0),igstRate:0,cgstRate:0,sgstRate:0};
  const matches = rates => ['igst','cgst','sgst'].every(tax =>
    Math.abs(money(Number(item.AssAmt) * rates[`${tax}Rate`] / 100) - Number(item[`${tax[0].toUpperCase()}${tax.slice(1)}Amt`] || 0)) <= 0.001);
  if (preferred && money(preferred.taxRate) === money(item.GstRt) && matches(preferred)) return preferred;
  if (Number(item.AssAmt) === 0 && Number(item.GstRt) > 0) throw new Error('Zero-value registered item has ambiguous tax components.');
  const total = Number(item.GstRt || 0);
  const split = Number(item.CgstAmt || 0) > 0 || Number(item.SgstAmt || 0) > 0;
  const rates = {taxRate:total, igstRate:split ? 0 : total, cgstRate:split ? total/2 : 0, sgstRate:split ? total/2 : 0};
  if (!matches(rates)) throw new Error('Registered item tax rates cannot be recovered exactly from the saved submission.');
  return rates;
}

export function makeTaxSnapshot(invoice, document, preferCurrent = false) {
  if (String(document?.DocDtls?.No || '').trim() !== String(invoice.header.InvoiceNo).trim()) throw new Error('Registered document number does not match invoice.');
  const items = document.ItemList || [];
  const withoutPayment = ['EXPWOP','SEZWOP'].includes(document.TranDtls?.SupTyp);
  const goods = items.filter(item => item.IsServc !== 'Y');
  if (goods.length !== invoice.lines.length) throw new Error('Registered item count does not match invoice; tax recovery needs review.');
  const bySerial = new Map(goods.map(item => [String(item.SlNo), item]));
  const lines = invoice.lines.map((line,index) => {
    const item = bySerial.get(String(index+1));
    if (!item || Number(item.Qty) !== Number(line.Qty) || money(item.AssAmt) !== money(line.Amount)
      || money(item.UnitPrice) !== money(line.Rate)
      || String(item.PrdDesc) !== String(line.VendorArticleName || line.SKUCode || line.StyleId || '').trim().slice(0,300)
      || String(item.HsnCd) !== String(line.HSNCode).replace(/\D/g,'')) {
      throw new Error(`Registered item ${index+1} cannot be matched safely to PO item ${line.POID}.`);
    }
    return {poid:Number(line.POID), ...ratesFromItem(item, preferCurrent ? lineTaxRates(invoice.header,line) : null,withoutPayment)};
  });
  if (new Set(lines.map(line=>line.poid)).size !== lines.length) throw new Error('Invoice has duplicate PO item identities.');
  const services = items.filter(item => item.IsServc === 'Y');
  if (services.length > 1) throw new Error('Registered service lines need review before recovering transportation tax.');
  const distinct = [...new Set(lines.map(line=>line.taxRate))];
  const rate = distinct.length === 1 ? distinct[0] : 5;
  const split = lines.length > 0 && lines.every(line=>line.igstRate===0);
  const transportation = services.length ? ratesFromItem(services[0],null,withoutPayment)
    : {taxRate:rate,igstRate:split||withoutPayment?0:rate,cgstRate:split&&!withoutPayment?rate/2:0,sgstRate:split&&!withoutPayment?rate/2:0};
  return {version:1, invoiceNo:invoice.header.InvoiceNo, lines, transportation};
}

export async function saveTaxCandidate(run, invoice, document) {
  const snapshot = makeTaxSnapshot(invoice,document,true);
  await run(`INSERT INTO webInvoiceTaxSnapshots (InvoiceID, InvoiceNo, IRN, SnapshotJson) VALUES (?, ?, NULL, ?)
    ON DUPLICATE KEY UPDATE SnapshotJson = IF(IRN IS NULL, VALUES(SnapshotJson), SnapshotJson)`,
    [invoice.header.InvoiceID,invoice.header.InvoiceNo,JSON.stringify(snapshot)]);
}

export async function freezeTaxCandidate(run, invoiceId, invoiceNo, irn) {
  const rows = await run('SELECT IRN FROM webInvoiceTaxSnapshots WHERE InvoiceID = ? FOR UPDATE',[invoiceId]);
  if (!rows.length) return; // Older submissions are recovered from their immutable request on invoice read.
  if (storedIrn(rows[0].IRN) && storedIrn(rows[0].IRN)!==storedIrn(irn)) throw new Error('Tax snapshot belongs to a different IRN.');
  await run('UPDATE webInvoiceTaxSnapshots SET IRN = ? WHERE InvoiceID = ? AND InvoiceNo = ?', [storedIrn(irn),invoiceId,invoiceNo]);
}

export async function resolveInvoiceTaxSnapshot(header, lines) {
  await ensureInvoiceTaxSnapshots();
  const snapshots = await query('SELECT IRN, SnapshotJson FROM webInvoiceTaxSnapshots WHERE InvoiceID = ?', [header.InvoiceID]);
  const snapshot = snapshots[0];
  let irn = storedIrn(header.IRN);
  if (snapshot && storedIrn(snapshot.IRN)) {
    if (irn && irn !== storedIrn(snapshot.IRN)) throw new Error('Invoice IRN does not match its frozen tax snapshot.');
    return applyTaxSnapshot({...header,IRN:irn || snapshot.IRN},lines,parse(snapshot.SnapshotJson));
  }
  let records = [];
  try {
    records = await query('SELECT InvoiceID, RequestJson, ResultJson FROM webWhitebooksProductionIrn WHERE InvoiceNo = ?', [header.InvoiceNo]);
  } catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
  const record = records[0];
  const result = record?.ResultJson ? parse(record.ResultJson) : null;
  const registeredIrn = storedIrn(result?.Irn);
  if (!irn && !registeredIrn) return {header,lines};
  if (irn && registeredIrn && irn !== registeredIrn) throw new Error('Saved submission IRN differs from invoice IRN; tax recovery needs review.');
  irn ||= registeredIrn;
  if (snapshot) {
    await query('UPDATE webInvoiceTaxSnapshots SET IRN = ? WHERE InvoiceID = ? AND IRN IS NULL',[irn,header.InvoiceID]);
    return applyTaxSnapshot({...header,IRN:irn},lines,parse(snapshot.SnapshotJson));
  }
  if (!record?.RequestJson || !registeredIrn || Number(record.InvoiceID)!==Number(header.InvoiceID)) {
    throw new Error(`Invoice ${header.InvoiceNo} has a registered/cancelled IRN but no verified saved tax submission. Recover its registered JSON before recalculating taxes.`);
  }
  // Never reconstruct an old registered invoice from today's PO tax rates.
  let document = parse(record.RequestJson);
  if (result?.SignedInvoice) {
    try {
      const decoded = JSON.parse(Buffer.from(result.SignedInvoice.split('.')[1],'base64url').toString('utf8'));
      document = parse(decoded.data ?? decoded);
      if (document.Irn && storedIrn(document.Irn)!==irn) throw new Error('IRN mismatch');
    } catch { throw new Error('Saved signed invoice cannot be decoded or does not match the IRN; tax recovery needs review.'); }
  }
  const recovered = makeTaxSnapshot({header,lines},document);
  await query(`INSERT IGNORE INTO webInvoiceTaxSnapshots (InvoiceID, InvoiceNo, IRN, SnapshotJson) VALUES (?, ?, ?, ?)`,
    [header.InvoiceID,header.InvoiceNo,irn,JSON.stringify(recovered)]);
  return applyTaxSnapshot({...header,IRN:irn},lines,recovered);
}

export function applyTaxSnapshot(header,lines,snapshot) {
  if (snapshot.invoiceNo && snapshot.invoiceNo !== header.InvoiceNo) throw new Error('Frozen tax snapshot belongs to a different invoice number.');
  const rates = new Map(snapshot.lines.map(line=>[Number(line.poid),line]));
  if (rates.size !== lines.length) throw new Error('Frozen invoice item identities changed; review registered tax details.');
  return {header:{...header,TaxDetailsVersion:2,FrozenTransportationTaxRates:snapshot.transportation}, lines:lines.map(line=>{
    if (!rates.has(Number(line.POID))) throw new Error('Frozen invoice PO item no longer matches.');
    return {...line,FrozenTaxRates:rates.get(Number(line.POID))};
  })};
}
