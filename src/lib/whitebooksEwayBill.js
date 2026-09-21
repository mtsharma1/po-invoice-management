import { createHash } from 'node:crypto';
import { prepareEInvoice } from './eInvoice';
import { query } from './db';
import { getSandboxIrn } from './whitebooksIrn';
import { authenticateWhitebooksEwayBill, generateStandaloneWhitebooksEwayBill, WhitebooksError } from './whitebooks';

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS webWhitebooksSandboxEwayBill (
    InvoiceNo VARCHAR(255) NOT NULL PRIMARY KEY, Irn CHAR(64) NOT NULL UNIQUE,
    State VARCHAR(20) NOT NULL, RequestJson LONGTEXT NOT NULL, ResultJson LONGTEXT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

async function getLegacyEwayBill(invoiceNo) {
  await ensureTable();
  const rows = await query('SELECT State, ResultJson FROM webWhitebooksSandboxEwayBill WHERE InvoiceNo = ?', [invoiceNo]);
  if (rows.length) return { state: rows[0].State, result: rows[0].ResultJson ? JSON.parse(rows[0].ResultJson) : null };
  const source = await getSandboxIrn(invoiceNo);
  // IRN generation can already have generated an e-way bill.
  if (source?.result?.EwbNo) return { state: 'succeeded', result: source.result };
  return null;
}

export function prepareEwayBill(irn, input = {}) {
  const text = key => typeof input[key] === 'string' ? input[key].trim() : '';
  if (!/^[a-f0-9]{64}$/i.test(irn || '')) throw new WhitebooksError('A saved sandbox IRN is required.');
  const distance = Number(input.Distance);
  if (input.Distance === '' || input.Distance == null || !Number.isInteger(distance) || distance < 0 || distance > 4000) throw new WhitebooksError('Distance must be a whole number from 0 to 4000 km.');
  const mode = text('TransMode');
  if (!['1', '2', '3', '4'].includes(mode)) throw new WhitebooksError('Select a transport mode.');
  if (!['R', 'O'].includes(text('VehType'))) throw new WhitebooksError('Select a vehicle type.');
  const vehicle = text('VehNo').toUpperCase();
  if (mode === '1' && !/^[A-Z0-9]{4,20}$/.test(vehicle)) throw new WhitebooksError('Enter a valid road vehicle number without spaces.');
  const date = text('TransDocDt');
  if (date) {
    const [day, month, year] = date.split('/').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date) || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new WhitebooksError('Transport document date must be a valid DD/MM/YYYY date.');
  }
  if (mode !== '1' && (!text('TransDocNo') || !date)) throw new WhitebooksError('Transport document number and date are required for this mode.');
  if (text('TransId') && !/^[A-Z0-9]{15}$/.test(text('TransId').toUpperCase())) throw new WhitebooksError('Transporter ID must contain 15 letters or digits.');
  if (text('TransDocNo').length > 15 || text('TransName').length > 100) throw new WhitebooksError('Transport document number must be at most 15 characters and transporter name at most 100.');
  const body = { Irn: irn, Distance: distance, TransMode: mode, VehType: text('VehType') };
  for (const key of ['TransId', 'TransName', 'TransDocDt', 'TransDocNo']) if (text(key)) body[key] = key === 'TransId' ? text(key).toUpperCase() : text(key);
  if (vehicle) body.VehNo = vehicle;
  return body;
}


async function ensureStandaloneTable() {
  await query(`CREATE TABLE IF NOT EXISTS webWhitebooksStandaloneEwayBill (
    InvoiceNo VARCHAR(255) NOT NULL PRIMARY KEY, DocumentKey CHAR(64) NOT NULL UNIQUE,
    State VARCHAR(20) NOT NULL, RequestJson LONGTEXT NOT NULL, ResultJson LONGTEXT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

export async function getSandboxEwayBill(invoiceNo) {
  await ensureStandaloneTable();
  const rows = await query('SELECT State, ResultJson FROM webWhitebooksStandaloneEwayBill WHERE InvoiceNo = ?', [invoiceNo]);
  if (rows.length) return { state: rows[0].State, result: rows[0].ResultJson ? JSON.parse(rows[0].ResultJson) : null };
  return getLegacyEwayBill(invoiceNo);
}

export function buildStandaloneEwayBill(document, transport) {
  if (document.DocDtls.Typ !== 'INV' || document.TranDtls.SupTyp !== 'B2B') throw new WhitebooksError('Standalone generation currently supports domestic outward sales invoices only.');
  const t = prepareEwayBill('a'.repeat(64), transport);
  const seller = document.SellerDtls, buyer = document.BuyerDtls;
  const from = document.DispDtls || seller, to = document.ShipDtls || buyer;
  const v = document.ValDtls;
  if (!document.ItemList.length || document.ItemList.some(item => item.IsServc === 'Y')) throw new WhitebooksError('An e-way bill requires goods items. Service-only or mixed service invoices are not supported.');
  if (document.ItemList.some(item => item.StateCesAmt || item.StateCesNonAdvlAmt)) throw new WhitebooksError('State cess requires review before standalone e-way bill generation.');
  const items = document.ItemList.map(item => ({
    productName: item.PrdDesc.slice(0, 100), productDesc: item.PrdDesc.slice(0, 100), hsnCode: Number(item.HsnCd),
    quantity: item.Qty + (item.FreeQty || 0), qtyUnit: item.Unit, taxableAmount: item.AssAmt,
    sgstRate: item.SgstAmt ? item.GstRt / 2 : 0, cgstRate: item.CgstAmt ? item.GstRt / 2 : 0,
    igstRate: item.IgstAmt ? item.GstRt : 0, cessRate: item.CesRt || 0, cessNonadvol: item.CesNonAdvlAmt || 0,
  }));
  const nonAdvol = document.ItemList.reduce((sum, item) => sum + (item.CesNonAdvlAmt || 0), 0);
  const body = {
    supplyType: 'O', subSupplyType: '1', docType: 'INV', docNo: document.DocDtls.No, docDate: document.DocDtls.Dt,
    fromGstin: seller.Gstin, fromTrdName: seller.TrdNm || seller.LglNm,
    fromAddr1: from.Addr1, fromPlace: from.Loc, fromPincode: from.Pin, fromStateCode: Number(seller.Stcd), actFromStateCode: Number(from.Stcd),
    toGstin: buyer.Gstin, toTrdName: buyer.TrdNm || buyer.LglNm,
    toAddr1: to.Addr1, toPlace: to.Loc, toPincode: to.Pin, toStateCode: Number(buyer.Stcd), actToStateCode: Number(to.Stcd),
    transactionType: document.DispDtls ? (document.ShipDtls ? 4 : 3) : (document.ShipDtls ? 2 : 1),
    totalValue: v.AssVal, cgstValue: v.CgstVal, sgstValue: v.SgstVal, igstValue: v.IgstVal,
    cessValue: v.CesVal - nonAdvol, cessNonAdvolValue: nonAdvol, totInvValue: v.TotInvVal,
    otherValue: Number(((v.OthChrg || 0) + (v.RndOffAmt || 0) - (v.Discount || 0)).toFixed(2)),
    transMode: t.TransMode, transDistance: String(t.Distance), vehicleType: t.VehType, itemList: items,
  };
  if (from.Addr2) body.fromAddr2 = from.Addr2;
  if (to.Addr2) body.toAddr2 = to.Addr2;
  for (const [source, target] of Object.entries({ TransId: 'transporterId', TransName: 'transporterName', TransDocDt: 'transDocDate', TransDocNo: 'transDocNo', VehNo: 'vehicleNo' })) if (t[source]) body[target] = t[source];
  return body;
}

export async function generateSandboxEwayBill(invoiceNo, transport, draft) {
  const existing = await getSandboxEwayBill(invoiceNo);
  if (existing?.state === 'succeeded') return { ok: true, ...existing };
  if (existing) throw new WhitebooksError('A previous e-way bill request is pending or uncertain. Reconcile it in WhiteBooks before resubmitting.');
  const prepared = await prepareEInvoice(invoiceNo, { ...draft, ewayBill: { ...transport, enabled: false } });
  if (!prepared.valid) return { ok: false, error: 'Correct invoice details before generating the e-way bill.', validation: prepared };
  const document = buildStandaloneEwayBill(prepared.document, transport);
  if (document.fromGstin !== process.env.WHITEBOOKS_GSTIN?.trim()) throw new WhitebooksError('Supplier GSTIN must match the configured sandbox GSTIN.');
  const auth = await authenticateWhitebooksEwayBill();
  const [, month, year] = document.docDate.split('/').map(Number);
  const key = createHash('sha256').update(JSON.stringify([document.fromGstin, month >= 4 ? year : year - 1, document.docType, document.docNo.toUpperCase()])).digest('hex');
  try {
    await query('INSERT INTO webWhitebooksStandaloneEwayBill (InvoiceNo, DocumentKey, State, RequestJson) VALUES (?, ?, ?, ?)', [invoiceNo, key, 'pending', JSON.stringify(document)]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new WhitebooksError('An e-way bill submission already exists. Refresh its status.');
    throw error;
  }
  let result;
  try {
    result = await generateStandaloneWhitebooksEwayBill(document, auth);
    await query('UPDATE webWhitebooksStandaloneEwayBill SET State = ?, ResultJson = ? WHERE InvoiceNo = ?', ['succeeded', JSON.stringify(result), invoiceNo]);
  } catch (error) {
    await query('UPDATE webWhitebooksStandaloneEwayBill SET State = ? WHERE InvoiceNo = ?', ['uncertain', invoiceNo]).catch(() => {});
    if (result) return { ok: true, state: 'uncertain', result, warning: 'E-way bill generated but saving failed. Download the result and reconcile in WhiteBooks.' };
    throw error;
  }
  return { ok: true, state: 'succeeded', result };
}
