import { getInvoice, listInvoices } from './invoices';

export const SUPPLY_TYPES = Object.freeze([
  { value: 'B2B', label: 'B2B — Business to business' },
  { value: 'SEZWP', label: 'SEZ with payment' },
  { value: 'SEZWOP', label: 'SEZ without payment' },
  { value: 'EXPWP', label: 'Export with payment' },
  { value: 'EXPWOP', label: 'Export without payment' },
  { value: 'DEXP', label: 'Deemed export' },
]);

export const DOCUMENT_TYPES = Object.freeze([
  { value: 'INV', label: 'Tax invoice' },
  { value: 'CRN', label: 'Credit note' },
  { value: 'DBN', label: 'Debit note' },
]);

const GST_RATES = new Set([0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40]);
const EXPORT_TYPES = new Set(['EXPWP', 'EXPWOP']);
const WITHOUT_PAYMENT_TYPES = new Set(['EXPWOP', 'SEZWOP']);
const WITH_PAYMENT_TYPES = new Set(['EXPWP', 'SEZWP']);
const STATE_NAMES = Object.freeze({
  '01': 'JAMMU AND KASHMIR', '02': 'HIMACHAL PRADESH', '03': 'PUNJAB', '04': 'CHANDIGARH',
  '05': 'UTTARAKHAND', '06': 'HARYANA', '07': 'DELHI', '08': 'RAJASTHAN',
  '09': 'UTTAR PRADESH', '10': 'BIHAR', '11': 'SIKKIM', '12': 'ARUNACHAL PRADESH',
  '13': 'NAGALAND', '14': 'MANIPUR', '15': 'MIZORAM', '16': 'TRIPURA',
  '17': 'MEGHALAYA', '18': 'ASSAM', '19': 'WEST BENGAL', '20': 'JHARKHAND',
  '21': 'ODISHA', '22': 'CHHATTISGARH', '23': 'MADHYA PRADESH', '24': 'GUJARAT',
  '26': 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU', '27': 'MAHARASHTRA',
  '29': 'KARNATAKA', '30': 'GOA', '31': 'LAKSHADWEEP', '32': 'KERALA',
  '33': 'TAMIL NADU', '34': 'PUDUCHERRY', '35': 'ANDAMAN AND NICOBAR ISLANDS',
  '36': 'TELANGANA', '37': 'ANDHRA PRADESH', '38': 'LADAKH', '96': 'OTHER COUNTRY',
  '97': 'OTHER TERRITORY',
});

const TRANSPORT_MODES = new Set(['1', '2', '3', '4']);
const JSON_OUTPUT_OPTIONS = Object.freeze({
  includeDispatchDetails: false,
  includeFreeQuantity: false,
});

export async function getEInvoiceScreenData({ invoiceNo = '', search = '' } = {}) {
  const rows = await listInvoices(200);
  const normalizedSearch = clean(search).toLowerCase();
  const filteredRows = normalizedSearch
    ? rows.filter((row) => [row.InvoiceNo, row.OrderNumber, row.POBarcode, row.ConsigneeName, row.DeliveredToName]
      .some((value) => clean(value).toLowerCase().includes(normalizedSearch)))
    : rows;

  if (!invoiceNo) return { rows: filteredRows, draft: null, validation: null, search };

  const invoice = await getInvoice(invoiceNo);
  if (!invoice.header) return { rows: filteredRows, draft: null, validation: null, search };
  const draft = createEInvoiceDraft(invoice);
  const prepared = prepareFromInvoice(invoice, draft);
  return {
    rows: filteredRows,
    draft,
    validation: publicPreparation(prepared, false),
    search,
  };
}

export async function prepareEInvoice(invoiceNo, overrides = {}) {
  const invoice = await getInvoice(clean(invoiceNo));
  if (!invoice.header) throw new Error('Invoice not found.');
  const draft = mergeDraft(createEInvoiceDraft(invoice), overrides);
  return publicPreparation(prepareFromInvoice(invoice, draft), true);
}

export function createEInvoiceDraft(invoice) {
  const { header, lines } = invoice;
  const seller = parsePartyAddress(header.BillFromAddress, {
    name: header.BillFromName || 'TEAKWOOD',
    gstin: header.GSTN,
    fallbackState: clean(header.GSTN).slice(0, 2),
  });
  const buyer = parsePartyAddress(header.ConsigneeAddress, {
    name: header.ConsigneeName,
    gstin: validText(header.BuyerGSTIN) ? header.BuyerGSTIN : '',
  });
  const dispatch = parsePartyAddress(header.DispatchFromAddress, {
    name: header.DispatchFromName || header.BillFromName,
    fallbackState: seller.Stcd,
  });
  const shipping = parsePartyAddress(header.DeliveredToAddress, {
    name: header.DeliveredToName,
    gstin: buyer.Gstin,
    fallbackState: buyer.Stcd,
  });
  const dispatchEnabled = Boolean(clean(header.DispatchFromAddress)) && !sameAddress(seller, dispatch);
  const shippingEnabled = Boolean(clean(header.DeliveredToAddress)) && !sameAddress(buyer, shipping);

  return {
    invoiceNo: clean(header.InvoiceNo),
    irn: normalizeIrn(header.IRN),
    acknowledgement: clean(header.AckNo),
    tran: {
      SupTyp: 'B2B',
      RegRev: 'N',
      IgstOnIntra: 'N',
      EcmGstin: '',
    },
    doc: {
      Typ: 'INV',
      No: clean(header.InvoiceNo),
      Dt: formatEinvoiceDate(header.InvoiceDate),
    },
    seller,
    buyer: { ...buyer, Pos: buyer.Stcd || clean(buyer.Gstin).slice(0, 2) },
    dispatch: { enabled: dispatchEnabled, ...dispatch },
    shipping: { enabled: shippingEnabled, ...shipping },
    exportDetails: {
      enabled: false,
      ShipBNo: '',
      ShipBDt: '',
      Port: '',
      RefClm: 'N',
      ForCur: 'INR',
      CntCode: 'IN',
      ExpDuty: 0,
    },
    ewayBill: {
      enabled: false,
      TransId: '',
      TransName: '',
      Distance: 0,
      TransDocNo: '',
      TransDocDt: '',
      VehNo: '',
      VehType: 'R',
      TransMode: '1',
    },
    sourceSummary: {
      lineCount: lines.length,
      totalQty: roundQuantity(lines.reduce((sum, line) => sum + number(line.Qty), 0)),
      taxableAmount: roundMoney(lines.reduce((sum, line) => sum + number(line.Amount), 0)),
      buyerSource: 'Consignee Address',
    },
  };
}

function prepareFromInvoice(invoice, draft) {
  const document = buildDocument(invoice, draft);
  const { errors, warnings } = validateDocument(document, invoice, draft);
  const jsonText = JSON.stringify([document], null, 2);
  if (Buffer.byteLength(jsonText, 'utf8') > 2 * 1024 * 1024) {
    errors.push(error('Invoice', 'JSON_SIZE', 'Prepared JSON exceeds the 2 MB bulk-upload limit.'));
  }
  return {
    draft,
    document,
    errors,
    warnings,
    valid: errors.length === 0,
    hasIrn: Boolean(normalizeIrn(invoice.header.IRN)),
    fileName: `E-INVOICE_${safeFilePart(invoice.header.InvoiceNo)}.json`,
    summary: {
      invoiceNo: clean(invoice.header.InvoiceNo),
      itemCount: document.ItemList.length,
      taxableValue: document.ValDtls.AssVal,
      taxValue: roundMoney(document.ValDtls.IgstVal + document.ValDtls.CgstVal + document.ValDtls.SgstVal + document.ValDtls.CesVal + document.ValDtls.StCesVal),
      invoiceValue: document.ValDtls.TotInvVal,
      taxTreatment: document.ValDtls.IgstVal > 0 ? 'IGST' : (document.ValDtls.CgstVal > 0 || document.ValDtls.SgstVal > 0 ? 'CGST + SGST' : 'Without tax payment'),
      buyerSource: 'Consignee Address',
    },
  };
}

function publicPreparation(result, includeDocument) {
  const response = {
    draft: result.draft,
    errors: result.errors,
    warnings: result.warnings,
    valid: result.valid,
    hasIrn: result.hasIrn,
    fileName: result.fileName,
    summary: result.summary,
    items: result.document.ItemList,
    values: result.document.ValDtls,
  };
  if (includeDocument) response.document = result.document;
  return response;
}

function buildDocument(invoice, draft) {
  const seller = normalizedParty(draft.seller);
  const buyer = normalizedParty(draft.buyer);
  const supTyp = clean(draft.tran.SupTyp).toUpperCase();
  const gstRate = invoiceGstRate(invoice.header);
  const withoutPayment = WITHOUT_PAYMENT_TYPES.has(supTyp);
  const useIgst = WITH_PAYMENT_TYPES.has(supTyp)
    || (!withoutPayment && (seller.Stcd !== clean(draft.buyer.Pos) || clean(draft.tran.IgstOnIntra).toUpperCase() === 'Y'));
  const itemList = invoice.lines.map((line, index) => buildItem(line, index, gstRate, useIgst, withoutPayment));
  const assVal = sumMoney(itemList, 'AssAmt');
  const igstVal = sumMoney(itemList, 'IgstAmt');
  const cgstVal = sumMoney(itemList, 'CgstAmt');
  const sgstVal = sumMoney(itemList, 'SgstAmt');
  const cesVal = sumMoney(itemList, 'CesAmt');
  const stCesVal = sumMoney(itemList, 'StateCesAmt');
  const itemTotal = roundMoney(itemList.reduce((sum, item) => sum + number(item.TotItemVal), 0));
  const storedGrandTotal = number(invoice.header.GrandTotal);
  const totalInvVal = storedGrandTotal > 0 && Math.abs(storedGrandTotal - itemTotal) <= 1
    ? roundMoney(storedGrandTotal)
    : Math.round(itemTotal);
  const roundOff = roundMoney(totalInvVal - itemTotal);

  const document = {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: supTyp,
      RegRev: yn(draft.tran.RegRev),
      EcmGstin: nullable(clean(draft.tran.EcmGstin).toUpperCase()),
      IgstOnIntra: yn(draft.tran.IgstOnIntra),
    },
    DocDtls: {
      Typ: clean(draft.doc.Typ).toUpperCase(),
      No: clean(draft.doc.No),
      Dt: clean(draft.doc.Dt),
    },
    SellerDtls: jsonParty(seller, { includeGstin: true, includeContact: true }),
    BuyerDtls: {
      ...jsonParty(buyer, { includeGstin: true, includeContact: true }),
      Pos: clean(draft.buyer.Pos),
    },
  };

  if (JSON_OUTPUT_OPTIONS.includeDispatchDetails && draft.dispatch.enabled) {
    const dispatch = normalizedParty(draft.dispatch);
    document.DispDtls = {
      Nm: dispatch.LglNm,
      Addr1: dispatch.Addr1,
      Addr2: nullable(dispatch.Addr2),
      Loc: dispatch.Loc,
      Pin: integerOrZero(dispatch.Pin),
      Stcd: dispatch.Stcd,
    };
  }

  if (draft.shipping.enabled) {
    const shipping = normalizedParty(draft.shipping);
    document.ShipDtls = {
      Gstin: shipping.Gstin || buyer.Gstin,
      LglNm: shipping.LglNm,
      TrdNm: nullable(shipping.TrdNm),
      Addr1: shipping.Addr1,
      Addr2: nullable(shipping.Addr2),
      Loc: shipping.Loc,
      Pin: integerOrZero(shipping.Pin),
      Stcd: shipping.Stcd,
    };
  }

  document.ValDtls = {
    AssVal: assVal,
    CgstVal: cgstVal,
    SgstVal: sgstVal,
    IgstVal: igstVal,
    CesVal: cesVal,
    StCesVal: stCesVal,
    Discount: 0,
    OthChrg: 0,
    RndOffAmt: roundOff,
    TotInvVal: totalInvVal,
  };

  if (EXPORT_TYPES.has(supTyp) || draft.exportDetails.enabled) {
    document.ExpDtls = {
      ShipBNo: nullable(clean(draft.exportDetails.ShipBNo)),
      ShipBDt: nullable(clean(draft.exportDetails.ShipBDt)),
      Port: nullable(clean(draft.exportDetails.Port).toUpperCase()),
      RefClm: yn(draft.exportDetails.RefClm),
      ForCur: clean(draft.exportDetails.ForCur).toUpperCase(),
      CntCode: clean(draft.exportDetails.CntCode).toUpperCase(),
      ExpDuty: roundMoney(draft.exportDetails.ExpDuty),
    };
  }

  if (draft.ewayBill.enabled) {
    document.EwbDtls = {
      TransId: nullable(clean(draft.ewayBill.TransId).toUpperCase()),
      TransName: nullable(clean(draft.ewayBill.TransName)),
      Distance: integerOrZero(draft.ewayBill.Distance),
      TransDocNo: nullable(clean(draft.ewayBill.TransDocNo)),
      TransDocDt: nullable(clean(draft.ewayBill.TransDocDt)),
      VehNo: nullable(clean(draft.ewayBill.VehNo).toUpperCase().replace(/\s+/g, '')),
      VehType: clean(draft.ewayBill.VehType).toUpperCase() || 'R',
      TransMode: clean(draft.ewayBill.TransMode) || '1',
    };
  }

  document.ItemList = itemList;
  return document;
}

function buildItem(line, index, gstRate, useIgst, withoutPayment) {
  const qty = roundQuantity(line.Qty);
  const unitPrice = roundMoney(line.Rate);
  const totalAmount = roundMoney(number(line.Amount) || qty * unitPrice);
  const taxableAmount = totalAmount;
  const taxableRate = GST_RATES.has(number(gstRate)) ? number(gstRate) : 18;
  const igstAmount = !withoutPayment && useIgst ? percentageMoney(taxableAmount, taxableRate, 100) : 0;
  const cgstAmount = !withoutPayment && !useIgst ? percentageMoney(taxableAmount, taxableRate, 200) : 0;
  const sgstAmount = !withoutPayment && !useIgst ? percentageMoney(taxableAmount, taxableRate, 200) : 0;
  return {
    SlNo: String(index + 1),
    PrdDesc: clean(line.VendorArticleName || line.SKUCode || line.StyleId).slice(0, 300),
    IsServc: 'N',
    HsnCd: clean(line.HSNCode).replace(/\D/g, ''),
    Qty: qty,
    ...(JSON_OUTPUT_OPTIONS.includeFreeQuantity ? { FreeQty: 0 } : {}),
    Unit: unitCode(line.Size),
    UnitPrice: unitPrice,
    TotAmt: totalAmount,
    Discount: 0,
    PreTaxVal: 0,
    AssAmt: taxableAmount,
    GstRt: taxableRate,
    IgstAmt: igstAmount,
    CgstAmt: cgstAmount,
    SgstAmt: sgstAmount,
    CesRt: 0,
    CesAmt: 0,
    CesNonAdvlAmt: 0,
    StateCesRt: 0,
    StateCesAmt: 0,
    StateCesNonAdvlAmt: 0,
    OthChrg: 0,
    TotItemVal: roundMoney(taxableAmount + igstAmount + cgstAmount + sgstAmount),
  };
}

function validateDocument(document, invoice, draft) {
  const errors = [];
  const warnings = [];
  const add = (section, code, message, item) => errors.push(error(section, code, message, item));
  const warn = (section, code, message) => warnings.push(error(section, code, message));
  const { TranDtls: tran, DocDtls: doc, SellerDtls: seller, BuyerDtls: buyer } = document;

  if (!SUPPLY_TYPES.some((option) => option.value === tran.SupTyp)) add('Transaction', 'SUPPLY_TYPE', 'Select a supported supply type.');
  if (!['Y', 'N'].includes(tran.RegRev)) add('Transaction', 'REVERSE_CHARGE', 'Reverse charge must be Y or N.');
  if (!['Y', 'N'].includes(tran.IgstOnIntra)) add('Transaction', 'IGST_ON_INTRA', 'IGST-on-intra-state must be Y or N.');
  if (tran.EcmGstin && !isValidGstin(tran.EcmGstin)) add('Transaction', 'ECOM_GSTIN', 'E-commerce GSTIN is invalid.');

  if (!DOCUMENT_TYPES.some((option) => option.value === doc.Typ)) add('Document', 'DOCUMENT_TYPE', 'Select INV, CRN or DBN.');
  if (!/^[A-Za-z0-9][A-Za-z0-9\-/]{0,15}$/.test(doc.No)) add('Document', 'DOCUMENT_NUMBER', 'Document number must be 1–16 characters and use only letters, numbers, / or -.');
  const invoiceDate = parseEinvoiceDate(doc.Dt);
  if (!invoiceDate) add('Document', 'DOCUMENT_DATE', 'Document date must be in DD/MM/YYYY format.');
  if (invoiceDate && invoiceDate.getTime() > endOfToday().getTime()) add('Document', 'FUTURE_DATE', 'Document date cannot be in the future.');
  if (invoiceDate && daysBetween(invoiceDate, new Date()) > 30) {
    warn('Document', 'REPORTING_WINDOW', 'Document is older than 30 days. Confirm that the supplier is not subject to the IRP reporting-time restriction.');
  }

  validateParty(seller, 'Seller', add, { requireGstin: true });
  if (seller.Gstin && seller.Stcd && seller.Gstin.slice(0, 2) !== seller.Stcd) add('Seller', 'GSTIN_STATE', 'Seller GSTIN state code does not match seller state code.');

  const exportSupply = EXPORT_TYPES.has(tran.SupTyp);
  validateParty(buyer, 'Buyer', add, { requireGstin: !exportSupply, allowUrp: exportSupply, foreign: exportSupply });
  if (exportSupply) {
    if (buyer.Gstin !== 'URP') add('Buyer', 'EXPORT_GSTIN', 'Export buyer GSTIN must be URP.');
    if (buyer.Pos !== '96') add('Buyer', 'EXPORT_POS', 'Export place of supply must be 96 (Other Country).');
  } else {
    if (buyer.Gstin === 'URP') add('Buyer', 'BUYER_GSTIN', 'A registered buyer GSTIN is required for this supply type.');
    if (!STATE_NAMES[buyer.Pos]) add('Buyer', 'PLACE_OF_SUPPLY', 'Buyer place of supply must be a valid state code.');
    if (buyer.Gstin && buyer.Gstin !== 'URP' && buyer.Pos && buyer.Gstin.slice(0, 2) !== buyer.Pos) {
      warn('Buyer', 'GSTIN_POS', 'Buyer GSTIN state differs from place of supply; confirm this is intentional.');
    }
  }

  if (document.DispDtls) validateDispatch(document.DispDtls, 'Dispatch From', add);
  if (document.ShipDtls) validateParty(document.ShipDtls, 'Ship To', add, { requireGstin: !exportSupply, allowUrp: exportSupply, foreign: exportSupply });

  if (!document.ItemList.length) add('Items', 'NO_ITEMS', 'At least one invoice item is required.');
  if (document.ItemList.length > 1000) add('Items', 'ITEM_LIMIT', 'An e-invoice may contain at most 1,000 items.');
  const seen = new Set();
  document.ItemList.forEach((item, index) => {
    const row = index + 1;
    if (seen.has(item.SlNo)) add('Items', 'DUPLICATE_SERIAL', `Duplicate serial number ${item.SlNo}.`, row);
    seen.add(item.SlNo);
    if (!item.PrdDesc) add('Items', 'PRODUCT_DESCRIPTION', 'Product description is required.', row);
    if (!/^\d{4,8}$/.test(item.HsnCd)) add('Items', 'HSN', 'HSN must contain 4–8 digits.', row);
    if (item.Qty <= 0) add('Items', 'QUANTITY', 'Quantity must be greater than zero.', row);
    if (!['NOS', 'SET'].includes(item.Unit)) add('Items', 'UNIT', 'Unit must be NOS or SET.', row);
    if (item.UnitPrice < 0 || item.TotAmt < 0 || item.AssAmt < 0) add('Items', 'NEGATIVE_VALUE', 'Item monetary values cannot be negative.', row);
    if (!GST_RATES.has(item.GstRt)) add('Items', 'GST_RATE', `GST rate ${item.GstRt} is not supported.`, row);
    const expectedTotal = roundMoney(item.AssAmt + item.IgstAmt + item.CgstAmt + item.SgstAmt + item.CesAmt + item.StateCesAmt + item.OthChrg);
    if (Math.abs(expectedTotal - item.TotItemVal) > 0.01) add('Items', 'ITEM_TOTAL', 'Item total does not reconcile with taxable value and taxes.', row);
  });

  const values = document.ValDtls;
  const reconciled = roundMoney(values.AssVal + values.IgstVal + values.CgstVal + values.SgstVal + values.CesVal + values.StCesVal + values.OthChrg - values.Discount + values.RndOffAmt);
  if (Math.abs(reconciled - values.TotInvVal) > 0.01) add('Values', 'INVOICE_TOTAL', 'Invoice total does not reconcile with taxable value, taxes and round-off.');
  if (Math.abs(values.RndOffAmt) > 99.99) add('Values', 'ROUND_OFF', 'Round-off must be between -99.99 and 99.99.');

  if (document.ExpDtls) validateExport(document.ExpDtls, exportSupply, add);
  if (document.EwbDtls) validateEwayBill(document.EwbDtls, add);

  if (normalizeIrn(invoice.header.IRN)) warn('Invoice', 'IRN_EXISTS', 'IRN is already generated for this invoice. Confirmation is required before preparing JSON.');
  if (!clean(invoice.header.ConsigneeAddress)) add('Buyer', 'CONSIGNEE_ADDRESS', 'Consignee Address is blank; BuyerDtls cannot be prepared.');
  if (draft.sourceSummary?.buyerSource === 'Consignee Address') warn('Buyer', 'BUYER_SOURCE', 'Buyer details were populated from Consignee Address as configured.');
  return { errors, warnings };
}

function validateParty(party, section, add, { requireGstin = false, allowUrp = false, foreign = false } = {}) {
  if (requireGstin && !party.Gstin) add(section, 'GSTIN_REQUIRED', `${section} GSTIN is required.`);
  if (party.Gstin && !(allowUrp && party.Gstin === 'URP') && !isValidGstin(party.Gstin)) add(section, 'GSTIN_INVALID', `${section} GSTIN is invalid.`);
  if (!party.LglNm || party.LglNm.length < 3 || party.LglNm.length > 100) add(section, 'LEGAL_NAME', `${section} legal name must contain 3–100 characters.`);
  if (!party.Addr1 || party.Addr1.length > 100) add(section, 'ADDRESS1', `${section} address line 1 is required and must not exceed 100 characters.`);
  if (party.Addr2 && party.Addr2.length > 100) add(section, 'ADDRESS2', `${section} address line 2 must not exceed 100 characters.`);
  if (!party.Loc || party.Loc.length < 3 || party.Loc.length > 50) add(section, 'LOCATION', `${section} location must contain 3–50 characters.`);
  if (!foreign && !/^\d{6}$/.test(String(party.Pin || ''))) add(section, 'PIN', `${section} PIN must contain 6 digits.`);
  if (!foreign && !STATE_NAMES[party.Stcd]) add(section, 'STATE', `${section} state code is invalid.`);
  if (party.Ph && !/^\d{6,12}$/.test(party.Ph)) add(section, 'PHONE', `${section} phone must contain 6–12 digits.`);
  if (party.Em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(party.Em)) add(section, 'EMAIL', `${section} email address is invalid.`);
}

function validateDispatch(party, section, add) {
  if (!party.Nm || party.Nm.length > 100) add(section, 'NAME', `${section} name is required and must not exceed 100 characters.`);
  if (!party.Addr1 || party.Addr1.length > 100) add(section, 'ADDRESS1', `${section} address line 1 is required and must not exceed 100 characters.`);
  if (party.Addr2 && party.Addr2.length > 100) add(section, 'ADDRESS2', `${section} address line 2 must not exceed 100 characters.`);
  if (!party.Loc || party.Loc.length < 3 || party.Loc.length > 50) add(section, 'LOCATION', `${section} location must contain 3–50 characters.`);
  if (!/^\d{6}$/.test(String(party.Pin || ''))) add(section, 'PIN', `${section} PIN must contain 6 digits.`);
  if (!STATE_NAMES[party.Stcd]) add(section, 'STATE', `${section} state code is invalid.`);
}

function validateExport(details, required, add) {
  if (required && !/^[A-Z]{3}$/.test(details.ForCur)) add('Export', 'CURRENCY', 'Export currency must be a three-letter code.');
  if (required && !/^[A-Z]{2}$/.test(details.CntCode)) add('Export', 'COUNTRY', 'Export country must be a two-letter code.');
  if (details.ShipBNo && !details.ShipBDt) add('Export', 'SHIPPING_BILL_DATE', 'Shipping bill date is required when a shipping bill number is entered.');
  if (details.ShipBDt && !parseEinvoiceDate(details.ShipBDt)) add('Export', 'SHIPPING_BILL_DATE', 'Shipping bill date must be in DD/MM/YYYY format.');
  if (details.Port && !/^[A-Z0-9]{6}$/.test(details.Port)) add('Export', 'PORT_CODE', 'Port code must contain six letters/numbers.');
}

function validateEwayBill(details, add) {
  if (!details.TransId && !details.TransName) add('E-Way Bill', 'TRANSPORTER', 'Enter a transporter ID or transporter name.');
  if (details.TransId && !/^[0-9A-Z]{15}$/.test(details.TransId)) add('E-Way Bill', 'TRANSPORTER_ID', 'Transporter ID must contain 15 letters/numbers.');
  if (!Number.isInteger(details.Distance) || details.Distance < 0 || details.Distance > 4000) add('E-Way Bill', 'DISTANCE', 'Distance must be a whole number from 0 to 4,000 km.');
  if (!TRANSPORT_MODES.has(details.TransMode)) add('E-Way Bill', 'MODE', 'Transport mode must be Road, Rail, Air or Ship.');
  if (!['R', 'O'].includes(details.VehType)) add('E-Way Bill', 'VEHICLE_TYPE', 'Vehicle type must be Regular or Over-dimensional cargo.');
  if (details.TransDocDt && !parseEinvoiceDate(details.TransDocDt)) add('E-Way Bill', 'TRANSPORT_DATE', 'Transport document date must be in DD/MM/YYYY format.');
  if (details.TransMode === '1' && !details.VehNo) add('E-Way Bill', 'VEHICLE_NUMBER', 'Vehicle number is required for road transport.');
  if (details.VehNo && !/^[A-Z0-9\-/]{4,20}$/.test(details.VehNo)) add('E-Way Bill', 'VEHICLE_NUMBER', 'Vehicle number format is invalid.');
}

function mergeDraft(base, overrides) {
  const safe = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    ...base,
    tran: mergeSection(base.tran, safe.tran),
    doc: mergeSection(base.doc, safe.doc),
    seller: mergeSection(base.seller, safe.seller),
    buyer: mergeSection(base.buyer, safe.buyer),
    dispatch: mergeSection(base.dispatch, safe.dispatch),
    shipping: mergeSection(base.shipping, safe.shipping),
    exportDetails: mergeSection(base.exportDetails, safe.exportDetails),
    ewayBill: mergeSection(base.ewayBill, safe.ewayBill),
    sourceSummary: base.sourceSummary,
    invoiceNo: base.invoiceNo,
    irn: base.irn,
    acknowledgement: base.acknowledgement,
  };
}

function mergeSection(base, override) {
  const next = { ...base };
  if (!override || typeof override !== 'object' || Array.isArray(override)) return next;
  Object.keys(base).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(override, key)) next[key] = override[key];
  });
  return next;
}

function parsePartyAddress(rawValue, defaults = {}) {
  const raw = clean(rawValue);
  const rawLines = raw.split(/\r?\n/).map((line) => clean(line)).filter(Boolean);
  const gstin = clean(defaults.gstin).toUpperCase() || extractGstin(raw);
  const phone = extractPhone(raw);
  let name = clean(defaults.name);
  if (!name && rawLines.length && !/\d{6}|GST|PHONE|PH\s*NO/i.test(rawLines[0])) name = rawLines.shift();
  const addressLines = rawLines
    .filter((line) => !/\bGST(?:IN|N)?\b\s*(?:NO)?\s*[:\-]?/i.test(line))
    .filter((line) => !/\b(?:PH|PHONE|MOBILE)\s*(?:NO)?\s*[:\-]?/i.test(line))
    .map((line) => line.replace(/\bIndia\b[,.]?/ig, '').trim())
    .filter(Boolean);
  const pin = extractPin(raw);
  const stateCode = gstin.slice(0, 2) && STATE_NAMES[gstin.slice(0, 2)]
    ? gstin.slice(0, 2)
    : stateCodeFromAddress(raw) || clean(defaults.fallbackState);
  const location = locationFromAddress(addressLines, stateCode, pin);
  const cleanedAddress = cleanAddressForJson(addressLines, stateCode, pin);
  const { addr1, addr2 } = splitAddress(cleanedAddress, pin);
  return {
    Gstin: gstin,
    LglNm: name || clean(defaults.name),
    TrdNm: name || clean(defaults.name),
    Addr1: addr1,
    Addr2: addr2,
    Loc: location,
    Pin: pin || '',
    Stcd: stateCode,
    Ph: phone,
    Em: extractEmail(raw),
  };
}

function normalizedParty(party = {}) {
  return {
    Gstin: clean(party.Gstin).toUpperCase(),
    LglNm: clean(party.LglNm),
    TrdNm: clean(party.TrdNm),
    Addr1: clean(party.Addr1),
    Addr2: clean(party.Addr2),
    Loc: clean(party.Loc).toUpperCase(),
    Pin: clean(party.Pin),
    Stcd: clean(party.Stcd).padStart(2, '0'),
    Ph: clean(party.Ph).replace(/\D/g, ''),
    Em: clean(party.Em),
  };
}

function jsonParty(party, { includeGstin, includeContact }) {
  const value = {
    Gstin: includeGstin ? party.Gstin : undefined,
    LglNm: party.LglNm,
    TrdNm: nullable(party.TrdNm),
    Addr1: party.Addr1,
    Addr2: nullable(party.Addr2),
    Loc: party.Loc,
    Pin: integerOrZero(party.Pin),
    Stcd: party.Stcd,
  };
  if (includeContact) {
    value.Ph = nullable(party.Ph);
    value.Em = nullable(party.Em);
  }
  return value;
}

function invoiceGstRate(header) {
  const splitRate = number(header.CGST) + number(header.SGST);
  const rate = splitRate > 0 ? splitRate : number(header.IGSTRate);
  return GST_RATES.has(rate) ? rate : 18;
}

function unitCode(size) {
  return /\b(?:SET|PACK)\b/i.test(clean(size)) ? 'SET' : 'NOS';
}

function extractGstin(value) {
  return clean(value).toUpperCase().match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/)?.[0] || '';
}

function extractPin(value) {
  const matches = [...clean(value).matchAll(/\b[1-9]\d{5}\b/g)];
  return matches.at(-1)?.[0] || '';
}

function extractPhone(value) {
  return clean(value).match(/(?:PH|PHONE|MOBILE)\s*(?:NO)?\s*[:\-]?\s*(\d{6,12})/i)?.[1] || '';
}

function extractEmail(value) {
  return clean(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
}

function stateCodeFromAddress(value) {
  const upper = clean(value).toUpperCase();
  return Object.entries(STATE_NAMES).find(([code, name]) => code !== '96' && upper.includes(name))?.[0] || '';
}

function locationFromAddress(lines, stateCode, pin) {
  const stateName = STATE_NAMES[stateCode] || '';
  const address = lines.join(', ');
  const labelledLocationPatterns = [
    /\b(?:LOCATION|LOC|CITY|TOWN)\s*[:\-]\s*([A-Z][A-Z .'-]{1,49}?)(?=\s*(?:,|\b(?:BLOCK|DISTRICT|DIST|STATE|PIN|ZIP|POST|P\.?\s*O\.?)\b|$))/i,
    /\b(?:P\.?\s*O\.?|POST\s+OFFICE)\s*[:\-]\s*([A-Z][A-Z .'-]{1,49}?)(?=\s*(?:,|\b(?:BLOCK|DISTRICT|DIST|STATE|PIN|ZIP)\b|$))/i,
  ];
  for (const pattern of labelledLocationPatterns) {
    const labelledLocation = normalizeLocation(address.match(pattern)?.[1], stateName, stateCode, pin);
    if (labelledLocation) return labelledLocation;
  }

  const parts = address.split(',').map((part) => clean(part)).filter(Boolean);
  const candidates = parts.filter((part) => {
    const upper = part.toUpperCase();
    return !upper.includes(stateName) && !/^\d{6}$/.test(part) && upper !== 'INDIA' && !upper.includes(`(${stateCode})`);
  });
  const beforeState = parts.findLastIndex((part) => clean(part).toUpperCase().includes(stateName));
  if (beforeState > 0) {
    for (let index = beforeState - 1; index >= 0; index -= 1) {
      const candidate = normalizeLocation(parts[index], stateName, stateCode, pin);
      if (candidate && !/^(VILLAGE|PLOT|BLOCK|STREET|SECTOR|MODEL|IDC|DISTRICT|DIST|POST|P\.?\s*O\.?)\b/i.test(candidate)) return candidate;
    }
  }
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = normalizeLocation(candidates[index], stateName, stateCode, pin);
    if (candidate && !/^(VILLAGE|PLOT|BLOCK|STREET|SECTOR|MODEL|IDC|DISTRICT|DIST|POST|P\.?\s*O\.?)\b/i.test(candidate)) return candidate;
  }
  return '';
}

function normalizeLocation(value, stateName, stateCode, pin) {
  if (!value) return '';
  const pinPattern = pin ? new RegExp(`\\b${escapeRegExp(pin)}\\b`, 'gi') : null;
  const statePattern = stateName ? new RegExp(`\\b${escapeRegExp(stateName)}\\b`, 'gi') : null;
  return clean(value)
    .replace(pinPattern || /a^/, ' ')
    .replace(statePattern || /a^/, ' ')
    .replace(new RegExp(`\\(\\s*${escapeRegExp(stateCode)}\\s*\\)`, 'gi'), ' ')
    .replace(/\bINDIA\b/gi, ' ')
    .replace(/^[\s,;:\-]+|[\s,;:\-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 50)
    .toUpperCase();
}

function cleanAddressForJson(lines, stateCode, pin) {
  const stateName = STATE_NAMES[stateCode] || '';
  const statePattern = stateName ? new RegExp(`\\b${escapeRegExp(stateName)}\\b`, 'gi') : null;
  const pinPattern = pin ? new RegExp(`\\b${escapeRegExp(pin)}\\b`, 'gi') : null;
  const parts = lines.join(',').split(',').map((part) => clean(part)).filter(Boolean);
  const lastStateIndex = parts.findLastIndex((part) => stateName && part.toUpperCase().includes(stateName));
  const cleanedParts = parts.map((part, index) => {
    let value = part
      .replace(pinPattern || /a^/, ' ')
      .replace(/\bINDIA\b/gi, ' ')
      .replace(new RegExp(`\\(\\s*${escapeRegExp(stateCode)}\\s*\\)`, 'gi'), ' ');
    const withoutState = statePattern ? value.replace(statePattern, ' ') : value;
    const stateOnly = stateName && !withoutState.replace(/[\s,;:\-()]/g, '');
    if (stateOnly || index === lastStateIndex) value = withoutState;
    return value
      .replace(/^[\s,;:\-]+|[\s,;:\-]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }).filter(Boolean);
  return [...new Set(cleanedParts.map((part) => part.toUpperCase()))]
    .map((upperPart) => cleanedParts.find((part) => part.toUpperCase() === upperPart))
    .join(', ');
}

function splitAddress(value, pin) {
  const cleanValue = clean(value)
    .replace(new RegExp(`[, ]*${pin || 'a^'}[, ]*`, 'g'), ', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/^,\s*|,\s*$/g, '');
  if (cleanValue.length <= 100) return { addr1: cleanValue, addr2: '' };
  const comma = cleanValue.lastIndexOf(',', 100);
  const splitAt = comma >= 20 ? comma : 100;
  return {
    addr1: cleanValue.slice(0, splitAt).replace(/,\s*$/, '').trim(),
    addr2: cleanValue.slice(splitAt + (comma >= 20 ? 1 : 0)).trim().slice(0, 100),
  };
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sameAddress(left, right) {
  return ['Addr1', 'Addr2', 'Loc', 'Pin', 'Stcd'].every((key) => clean(left?.[key]).toUpperCase() === clean(right?.[key]).toUpperCase());
}

function isValidGstin(value) {
  const gstin = clean(value).toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return false;
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let factor = 1;
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const codePoint = chars.indexOf(gstin[index]);
    const product = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return chars[(36 - (sum % 36)) % 36] === gstin[14];
}

function formatEinvoiceDate(value) {
  if (!value) return '';
  const text = clean(value).slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function parseEinvoiceDate(value) {
  const match = clean(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  if (date.getFullYear() !== Number(match[3]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[1])) return null;
  return date;
}

function daysBetween(earlier, later) {
  return Math.floor((endOfToday(later).getTime() - earlier.getTime()) / 86400000);
}

function endOfToday(value = new Date()) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function sumMoney(items, field) {
  return roundMoney(items.reduce((sum, item) => sum + number(item[field]), 0));
}

function error(section, code, message, item = null) {
  return { section, code, message, item };
}

function yn(value) {
  return clean(value).toUpperCase() === 'Y' ? 'Y' : 'N';
}

function nullable(value) {
  return value === '' || value === undefined ? null : value;
}

function integerOrZero(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return roundDecimal(number(value), 2);
}

function percentageMoney(amount, rate, divisor) {
  const amountParts = decimalParts(amount);
  const rateParts = decimalParts(rate);
  const numerator = amountParts.integer * rateParts.integer * 100n;
  const denominator = BigInt(divisor) * powerOfTen(amountParts.scale + rateParts.scale);
  return Number(divideHalfUp(numerator, denominator)) / 100;
}

function roundDecimal(value, decimalPlaces) {
  const parts = decimalParts(value);
  const targetScale = Number(decimalPlaces);
  if (parts.scale <= targetScale) {
    return Number(parts.integer * powerOfTen(targetScale - parts.scale)) / (10 ** targetScale);
  }
  const divisor = powerOfTen(parts.scale - targetScale);
  return Number(divideHalfUp(parts.integer, divisor)) / (10 ** targetScale);
}

function decimalParts(value) {
  const numeric = number(value);
  const sign = numeric < 0 ? -1n : 1n;
  const [mantissa, exponentText = '0'] = Math.abs(numeric).toString().toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const exponent = Number(exponentText);
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '') || '0';
  const initialScale = fraction.length - exponent;
  if (initialScale < 0) {
    return { integer: sign * BigInt(digits) * powerOfTen(-initialScale), scale: 0 };
  }
  return { integer: sign * BigInt(digits), scale: initialScale };
}

function divideHalfUp(numerator, denominator) {
  const sign = numerator < 0n ? -1n : 1n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const quotient = absoluteNumerator / denominator;
  const remainder = absoluteNumerator % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return sign * rounded;
}

function powerOfTen(exponent) {
  return 10n ** BigInt(exponent);
}

function roundQuantity(value) {
  return Math.round((number(value) + Number.EPSILON) * 1000) / 1000;
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validText(value) {
  const valueText = clean(value).toLowerCase();
  return Boolean(valueText) && !['null', 'undefined'].includes(valueText);
}

function clean(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return ['null', 'undefined'].includes(text.toLowerCase()) ? '' : text;
}

function normalizeIrn(value) {
  return clean(value).replace(/\s+/g, '');
}

function safeFilePart(value) {
  return clean(value).replace(/[\\/:*?"<>|]/g, '_') || 'INVOICE';
}
