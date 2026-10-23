import { query, withTransaction } from './db';
import { getWebSettings } from './settings';
import { ensureInvoiceTaxVersionColumn } from './invoiceTaxSchema';
import { ensureInvoicePresentationColumns } from './invoicePresentationSchema';
import { ensureInvoiceTransportationColumn } from './invoiceTransportationSchema';

const defaultBankDetails = {
  AccountNo: '6811361613',
  BankName: 'KOTAK MAHINDRA BANK LTD.',
  BranchName: 'SEC-14, GURGAON',
  IFSCCode: 'KKBK0000287',
};

const invoiceFields = [
  'InvoiceNo',
  'InvoiceDate',
  'GSTN',
  'IRN',
  'AckNo',
  'AckDate',
  'BillFromName',
  'BillFromAddress',
  'DispatchFromName',
  'DispatchFromAddress',
  'ConsigneeName',
  'ConsigneeAddress',
  'DeliveredToName',
  'DeliveredToAddress',
  'BuyerName',
  'BuyerAddress',
  'BuyerGSTIN',
  'AccountNo',
  'BeneficiaryName',
  'InvoiceNote',
  'BankName',
  'BranchName',
  'IFSCCode',
  'TotalInWords',
  'TransportationCharges',
  'POBarcode',
  'SealNo',
  'OrderNumber',
  'OrderDate',
  'SGST',
  'CGST',
  'IGSTRate',
  'InterStateTax',
];

export async function listCustomerInvoices({ search = '', limit = 100 } = {}) {
  const like = `%${search}%`;
  const where = search
    ? `WHERE h.InvoiceNo LIKE ?
        OR h.POBarcode LIKE ?
        OR h.OrderNumber LIKE ?
        OR h.ConsigneeName LIKE ?
        OR h.DeliveredToName LIKE ?`
    : '';
  const params = search ? [like, like, like, like, like, Number(limit)] : [Number(limit)];

  return query(
    `SELECT
       h.InvoiceID,
       h.InvoiceNo,
       h.InvoiceDate,
       h.POBarcode,
       h.OrderNumber,
       h.OrderDate,
       h.ConsigneeName,
       h.DeliveredToName,
       h.GrandTotal
     FROM tblInvoiceHeader h
     ${where}
     ORDER BY COALESCE(h.InvoiceDate, '1900-01-01') DESC, h.InvoiceID DESC
     LIMIT ?`,
    params
  );
}

export async function getCustomerInvoiceScreenData({ invoiceNo = '', search = '' } = {}) {
  const [rows, selectedInvoice] = await Promise.all([
    listCustomerInvoices({ search, limit: 150 }),
    getInvoiceHeaderForForm(invoiceNo),
  ]);

  return { rows, selectedInvoice, search };
}

export async function getInvoiceHeaderForForm(invoiceNo = '') {
  const settings = await getWebSettings();
  if (!invoiceNo) return blankInvoice(settings);

  const rows = await query(
    `SELECT *
     FROM tblInvoiceHeader
     WHERE InvoiceNo = ?
     ORDER BY COALESCE(InvoiceDate, '1900-01-01') DESC, InvoiceID DESC
     LIMIT 1`,
    [invoiceNo]
  );
  return rows[0] ? applyDefaultBankDetails(rows[0]) : blankInvoice(settings);
}

export async function saveCustomerInvoice(payload) {
  const invoiceNo = String(payload?.InvoiceNo || '').trim();
  if (!invoiceNo) throw new Error('Invoice No is required.');

  const invoiceId = Number(payload?.InvoiceID || 0);
  const invoice = applyDefaultBankDetails(payload);
  if (payload?.TransportationCharges !== undefined) {
    invoice.TransportationCharges = normaliseTransportationCharges(payload.TransportationCharges);
  }
  const savedBankDetails = pickBankDetails(invoice);
  await ensureInvoiceTaxVersionColumn();
  await ensureInvoicePresentationColumns();
  await ensureInvoiceTransportationColumn();
  return withTransaction(async (run) => {
    let updatedRegisteredCharges = false;
    if (invoiceId) {
      const existing = await run('SELECT InvoiceNo, IRN, TransportationCharges, AckNo, AckDate FROM tblInvoiceHeader WHERE InvoiceID = ? FOR UPDATE', [invoiceId]);
      if (!existing.length) throw new Error('Invoice not found.');
      const saved = existing[0];
      if (payload?.TransportationCharges === undefined) invoice.TransportationCharges = Number(saved.TransportationCharges || 0);
      if (Number(saved.TransportationCharges || 0) !== invoice.TransportationCharges) {
        invoice.TotalInWords = '';
        if (hasIrn(saved.IRN)) {
          // A local charge adjustment does not amend the registered document.
          invoice.IRN = saved.IRN;
          invoice.AckNo = saved.AckNo;
          invoice.AckDate = saved.AckDate;
          updatedRegisteredCharges = true;
        }
      }
    }
    if (!invoiceId && invoice.TransportationCharges > 0) invoice.TotalInWords = '';
    const duplicateRows = await run(
      `SELECT InvoiceID
       FROM tblInvoiceHeader
       WHERE InvoiceNo = ?
         AND (? = 0 OR InvoiceID <> ?)
       LIMIT 1`,
      [invoiceNo, invoiceId, invoiceId]
    );
    if (duplicateRows.length) {
      throw new Error('This invoice number already exists. Please use a different Invoice No.');
    }

    const values = invoiceFields.map((field) => normaliseField(field, invoice?.[field]));
    if (invoiceId) {
      const setSql = invoiceFields.map((field) => `${field} = ?`).join(', ');
      await run(`UPDATE tblInvoiceHeader SET ${setSql} WHERE InvoiceID = ?`, [...values, invoiceId]);
      return { invoiceId, invoiceNo, bankDetails: savedBankDetails, message: updatedRegisteredCharges
        ? 'Invoice saved. Transportation charges and totals updated locally; the registered IRN and e-way bill were not amended.'
        : 'Invoice saved successfully.' };
    }

    const placeholders = invoiceFields.map(() => '?').join(', ');
    const result = await run(
      `INSERT INTO tblInvoiceHeader (${invoiceFields.join(', ')}, TaxDetailsVersion)
       VALUES (${placeholders}, 1)`,
      values
    );
    return { invoiceId: result.insertId, invoiceNo, bankDetails: savedBankDetails, message: 'Invoice created successfully.' };
  });
}

function blankInvoice(settings) {
  return {
    InvoiceID: '',
    InvoiceNo: '',
    InvoiceDate: toDateInput(new Date()),
    GSTN: '06BMTPS4959L1ZX',
    IRN: '',
    AckNo: '',
    AckDate: '',
    BillFromName: settings.billFromName || 'TEAKWOOD',
    BillFromAddress: '',
    DispatchFromName: settings.dispatchFromName || 'TEAKWOOD',
    DispatchFromAddress: '',
    ConsigneeName: '',
    ConsigneeAddress: '',
    DeliveredToName: '',
    DeliveredToAddress: '',
    BuyerName: '',
    BuyerAddress: '',
    BuyerGSTIN: '',
    AccountNo: defaultIfBlank(settings.accountNo, defaultBankDetails.AccountNo),
    BankName: defaultIfBlank(settings.bankName, defaultBankDetails.BankName),
    BranchName: defaultIfBlank(settings.branchName, defaultBankDetails.BranchName),
    IFSCCode: defaultIfBlank(settings.ifscCode, defaultBankDetails.IFSCCode),
    TotalInWords: '',
    TransportationCharges: 0,
    InvoiceNote: '',
    BeneficiaryName: 'TEAKWOOD',
    POBarcode: '',
    SealNo: '',
    OrderNumber: '',
    OrderDate: '',
    SGST: 0,
    CGST: 0,
    IGSTRate: 18,
    InterStateTax: 0,
  };
}

function applyDefaultBankDetails(invoice = {}) {
  return {
    ...invoice,
    TransportationCharges: invoice.TransportationCharges ?? 0,
    InvoiceNote: invoice.InvoiceNote ?? '',
    BeneficiaryName: defaultIfBlank(invoice.BeneficiaryName, 'TEAKWOOD'),
    AccountNo: defaultIfBlank(invoice.AccountNo, defaultBankDetails.AccountNo),
    BankName: defaultIfBlank(invoice.BankName, defaultBankDetails.BankName),
    BranchName: defaultIfBlank(invoice.BranchName, defaultBankDetails.BranchName),
    IFSCCode: defaultIfBlank(invoice.IFSCCode, defaultBankDetails.IFSCCode),
  };
}

function pickBankDetails(invoice) {
  return {
    BeneficiaryName: invoice.BeneficiaryName,
    AccountNo: invoice.AccountNo,
    BankName: invoice.BankName,
    BranchName: invoice.BranchName,
    IFSCCode: invoice.IFSCCode,
  };
}

function defaultIfBlank(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return !text || ['null', 'undefined'].includes(text.toLowerCase()) ? fallback : text;
}

function normaliseField(field, value) {
  if (field === 'TransportationCharges') return normaliseTransportationCharges(value);
  if (['InvoiceDate', 'AckDate', 'OrderDate'].includes(field)) {
    return normaliseDate(value);
  }
  if (['SGST', 'CGST', 'IGSTRate'].includes(field)) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }
  if (field === 'InterStateTax') return value ? 1 : 0;
  if (value === undefined || value === '') return nullableField(field) ? null : value;
  return String(value);
}

function hasIrn(value) {
  return !['', 'null', 'undefined'].includes(String(value ?? '').trim().toLowerCase());
}

function normaliseTransportationCharges(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Transportation charges must be a non-negative amount with at most two decimal places.');
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount > 999999999999.99) throw new Error('Transportation charges are too large.');
  return amount;
}

function nullableField(field) {
  return ['InvoiceDate', 'AckDate', 'OrderDate'].includes(field);
}

function normaliseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  return String(value).replace('T', ' ').slice(0, 19);
}

function toDateInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
