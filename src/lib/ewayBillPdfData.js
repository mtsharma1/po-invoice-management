const clean = (value) => value == null || ['null', 'undefined'].includes(String(value).trim().toLowerCase()) ? '' : String(value).trim();
const states = {
  '01': 'JAMMU AND KASHMIR', '02': 'HIMACHAL PRADESH', '03': 'PUNJAB', '04': 'CHANDIGARH',
  '05': 'UTTARAKHAND', '06': 'HARYANA', '07': 'DELHI', '08': 'RAJASTHAN', '09': 'UTTAR PRADESH',
  '10': 'BIHAR', '11': 'SIKKIM', '12': 'ARUNACHAL PRADESH', '13': 'NAGALAND', '14': 'MANIPUR',
  '15': 'MIZORAM', '16': 'TRIPURA', '17': 'MEGHALAYA', '18': 'ASSAM', '19': 'WEST BENGAL',
  '20': 'JHARKHAND', '21': 'ODISHA', '22': 'CHHATTISGARH', '23': 'MADHYA PRADESH', '24': 'GUJARAT',
  '26': 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU', '27': 'MAHARASHTRA', '29': 'KARNATAKA',
  '30': 'GOA', '31': 'LAKSHADWEEP', '32': 'KERALA', '33': 'TAMIL NADU', '34': 'PUDUCHERRY',
  '35': 'ANDAMAN AND NICOBAR ISLANDS', '36': 'TELANGANA', '37': 'ANDHRA PRADESH', '38': 'LADAKH',
  '96': 'OTHER COUNTRY', '97': 'OTHER TERRITORY',
};
// The portal prints the place/state/PIN here, rather than the full street address.
const address = (party = {}) => [party.Loc, states[clean(party.Stcd).padStart(2, '0')] || (party.Stcd && `State ${party.Stcd}`), party.Pin].map(clean).filter(Boolean).join(' ');

function entryTime(value) {
  const match = clean(value).match(/^(\d{2})[/-](\d{2})[/-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return NaN;
  const [, day, month, year, hour, minute, second = '0', period] = match;
  const h = period ? Number(hour) % 12 + (period.toUpperCase() === 'PM' ? 12 : 0) : Number(hour);
  return Date.UTC(Number(year), Number(month) - 1, Number(day), h, Number(minute), Number(second));
}

export function enrichEwayBillPdfData(base, details) {
  if (clean(details.ewbNo ?? details.ewayBillNo) !== base.number || clean(details.docNo) !== base.invoiceNo) {
    throw new Error('The portal bill and saved invoice do not match.');
  }
  const generator = clean(details.userGstin);
  const generatorName = [
    [details.fromGstin, details.fromTrdName], [details.toGstin, details.toTrdName],
    [details.transporterId, details.transporterName],
  ].find(([gstin]) => generator && clean(gstin) === generator)?.[1];
  const history = (details.VehiclListDetails || []).map(row => ({
    mode: ({ 1: 'Road', 2: 'Rail', 3: 'Air', 4: 'Ship' })[clean(row.transMode)] || '',
    vehicle: clean(row.vehicleNo), transportDocumentNo: clean(row.transDocNo),
    transportDocumentDate: clean(row.transDocDate), vehicleFrom: clean(row.fromPlace),
    vehicleEnteredDate: clean(row.enteredDate), vehicleEnteredBy: clean(row.userGSTINTransin),
    cewbNo: Number(row.tripshtNo) > 0 ? clean(row.tripshtNo) : '',
    multiVehicleInfo: Number(row.groupNo) > 0 ? clean(row.groupNo) : '',
  }));
  // NIC: validity starts at the first qualifying Part B entry, not at invoice
  // creation and not at the most recent vehicle update. Preserve provider order.
  const qualifying = history.filter(row => row.mode === 'Road' ? row.vehicle : row.transportDocumentNo || (row.mode === 'Ship' && row.vehicle));
  const dated = qualifying.map(row => ({ row, time: entryTime(row.vehicleEnteredDate) }));
  const first = dated.length && dated.every(value => Number.isFinite(value.time))
    ? dated.reduce((a, b) => a.time <= b.time ? a : b).row.vehicleEnteredDate : '';
  return { ...base, portalDetails: true, status: clean(details.status),
    notes: (base.notes || []).filter(note => !note.startsWith('Original transport')),
    generated: clean(details.ewayBillDate) || base.generated,
    generatedBy: [generator, clean(generatorName)].filter(Boolean).join('  '),
    validFrom: clean(details.validFrom) || first,
    validUntil: clean(details.validUpto) || base.validUntil,
    distance: clean(details.actualDist), vehicleHistory: history,
    transporter: [clean(details.transporterId), clean(details.transporterName)].filter(Boolean).join(' - ') || base.transporter,
  };
}

export function makeEwayBillPdfData({ environment, submission, irnRecord, invoice, transport = {} }) {
  const result = submission?.result;
  if (submission?.state !== 'succeeded' || !/^\d{12}$/.test(clean(result?.EwbNo))) {
    throw new Error('A successfully saved e-way bill is required before downloading its PDF.');
  }
  const request = submission.request || {};
  const standalone = Boolean(request.docNo);
  const document = standalone ? {} : irnRecord?.request || {};
  const irnResult = standalone ? {} : irnRecord?.result || {};
  const header = invoice?.header || {};
  const snapshot = Boolean(document.DocDtls || standalone);
  const irn = clean(irnResult.Irn || request.Irn || (environment === 'production' ? header.IRN : ''));
  if (request.Irn && irnResult.Irn && clean(request.Irn).toLowerCase() !== clean(irnResult.Irn).toLowerCase()) {
    throw new Error('The saved e-way bill and e-invoice IRNs do not match. Reconcile the records first.');
  }
  const seller = document.SellerDtls || {};
  const buyer = document.BuyerDtls || {};
  const from = document.DispDtls || seller;
  const to = document.ShipDtls || buyer;
  // Saved generation requests take precedence over subsequently edited transport forms.
  const snapshotTransport = request.TransMode || request.transMode ? request : document.EwbDtls || {};
  const hasTransportSnapshot = Boolean(snapshotTransport.TransMode || snapshotTransport.transMode);
  const t = hasTransportSnapshot ? snapshotTransport : transport || {};
  const value = (upper, lower) => clean(t[upper] ?? t[lower]);
  const items = standalone ? (request.itemList || []).map(item => ({
    hsn: clean(item.hsnCode), description: clean(item.productDesc || item.productName),
  })) : document.ItemList ? document.ItemList.map(item => ({ hsn: clean(item.HsnCd), description: clean(item.PrdDesc) }))
    : (invoice?.lines || []).map(item => ({ hsn: clean(item.HSNCode), description: clean(item.VendorArticleName) }));
  const transactionType = standalone ? Number(request.transactionType) : snapshot
    ? document.DispDtls ? (document.ShipDtls ? 4 : 3) : document.ShipDtls ? 2 : 1 : 0;
  const notes = [
    'Saved-record copy, not a live portal status check. Vehicle updates, validity extensions, cancellation status and CEWB/multi-vehicle history are not available in the saved response.',
    'QR encodes bill number/GSTIN/generation timestamp; barcode encodes the bill number.',
  ];
  if (!snapshot) notes.push('Original e-invoice request unavailable: party, goods and invoice details use the current saved invoice.');
  if (!hasTransportSnapshot) notes.push('Original transport request unavailable: transport fields use the saved transport form and may differ from the issued bill.');
  const amount = standalone ? request.totInvValue : document.ValDtls?.TotInvVal ?? invoice?.totals?.grandTotal;
  return {
    environment, number: clean(result.EwbNo), generated: clean(result.EwbDt), validUntil: clean(result.EwbValidTill),
    validFrom: clean(result.ValidFrom),
    generatedBy: clean(result.GeneratedBy || result.UserGstin),
    irn, ackNo: clean(irnResult.AckNo || (environment === 'production' ? header.AckNo : '')), ackDate: clean(irnResult.AckDt || (environment === 'production' ? header.AckDate : '')),
    invoiceNo: clean(request.docNo || document.DocDtls?.No || header.InvoiceNo),
    invoiceDate: clean(request.docDate || document.DocDtls?.Dt || header.InvoiceDate),
    supplier: standalone ? [request.fromGstin, request.fromTrdName].map(clean).filter(Boolean).join('\n')
      : [seller.Gstin || header.GSTN, seller.LglNm || header.BillFromName].map(clean).filter(Boolean).join('\n'),
    recipient: standalone ? [request.toGstin, request.toTrdName].map(clean).filter(Boolean).join('\n')
      : [buyer.Gstin || header.BuyerGSTIN, buyer.LglNm || header.ConsigneeName].map(clean).filter(Boolean).join('\n'),
    dispatch: standalone ? address({ Loc: request.fromPlace, Stcd: request.actFromStateCode ?? request.fromStateCode, Pin: request.fromPincode })
      : address(from) || clean(header.DispatchFromAddress || header.BillFromAddress),
    delivery: standalone ? address({ Loc: request.toPlace, Stcd: request.actToStateCode ?? request.toStateCode, Pin: request.toPincode })
      : address(to) || clean(header.DeliveredToAddress || header.ConsigneeAddress),
    transaction: ({ 1: 'Regular', 2: 'Bill To - Ship To', 3: 'Bill From-Ship From', 4: 'Combination: Bill To - Ship To and Bill From - Ship From' })[transactionType] || '',
    goodsValue: amount == null || !Number.isFinite(Number(amount)) ? '' : Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    reason: standalone ? `${request.supplyType === 'O' ? 'Outward' : 'Inward'} - ${String(request.subSupplyType) === '1' ? 'Supply' : `Sub-supply ${request.subSupplyType}`}`
      : document.DocDtls?.Typ === 'INV' ? 'Outward - Supply' : '',
    transporter: [value('TransId', 'transporterId'), value('TransName', 'transporterName')].filter(Boolean).join(' - '),
    distance: value('Distance', 'transDistance'),
    mode: ({ 1: 'Road', 2: 'Rail', 3: 'Air', 4: 'Ship' })[value('TransMode', 'transMode')] || '',
    vehicle: value('VehNo', 'vehicleNo'), vehicleType: value('VehType', 'vehicleType'),
    transportDocument: [value('TransDocNo', 'transDocNo'), value('TransDocDt', 'transDocDate')].filter(Boolean).join(' / '),
    transportDocumentNo: value('TransDocNo', 'transDocNo'), transportDocumentDate: value('TransDocDt', 'transDocDate'),
    // Do not substitute document/generation dates for portal vehicle-history fields.
    vehicleFrom: clean(result.VehicleFrom), vehicleEnteredDate: clean(result.VehicleEnteredDate),
    vehicleEnteredBy: clean(result.VehicleEnteredBy), cewbNo: clean(result.CewbNo), multiVehicleInfo: clean(result.MultiVehicleInfo),
    items, notes,
  };
}

