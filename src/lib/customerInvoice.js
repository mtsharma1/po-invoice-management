import { query, withTransaction } from './db';
import { getWebSettings } from './settings';

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
  'BankName',
  'BranchName',
  'IFSCCode',
  'TotalInWords',
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
  return rows[0] || blankInvoice(settings);
}

export async function saveCustomerInvoice(payload) {
  const invoiceNo = String(payload?.InvoiceNo || '').trim();
  if (!invoiceNo) throw new Error('Invoice No is required.');

  const invoiceId = Number(payload?.InvoiceID || 0);
  return withTransaction(async (run) => {
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

    const values = invoiceFields.map((field) => normaliseField(field, payload?.[field]));
    if (invoiceId) {
      const setSql = invoiceFields.map((field) => `${field} = ?`).join(', ');
      await run(`UPDATE tblInvoiceHeader SET ${setSql} WHERE InvoiceID = ?`, [...values, invoiceId]);
      return { invoiceId, invoiceNo, message: 'Invoice saved successfully.' };
    }

    const placeholders = invoiceFields.map(() => '?').join(', ');
    const result = await run(
      `INSERT INTO tblInvoiceHeader (${invoiceFields.join(', ')})
       VALUES (${placeholders})`,
      values
    );
    return { invoiceId: result.insertId, invoiceNo, message: 'Invoice created successfully.' };
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
    AccountNo: settings.accountNo || defaultBankDetails.AccountNo,
    BankName: settings.bankName || defaultBankDetails.BankName,
    BranchName: settings.branchName || defaultBankDetails.BranchName,
    IFSCCode: settings.ifscCode || defaultBankDetails.IFSCCode,
    TotalInWords: '',
    POBarcode: '',
    SealNo: '',
    OrderNumber: '',
    OrderDate: '',
    SGST: 0,
    CGST: 0,
    IGSTRate: 18,
    InterStateTax: 1,
  };
}

function normaliseField(field, value) {
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
