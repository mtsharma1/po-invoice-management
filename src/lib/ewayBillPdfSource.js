import { query } from './db';
import { getInvoice } from './invoices';
import { makeEwayBillPdfData, enrichEwayBillPdfData } from './ewayBillPdfData';
import { getWhitebooksEwayBillDetails } from './whitebooks';

async function readRecord(table, invoiceNo) {
  try {
    const rows = await query(`SELECT State, RequestJson, ResultJson FROM ${table} WHERE InvoiceNo = ?`, [invoiceNo]);
    if (!rows.length) return null;
    return { state: rows[0].State, request: JSON.parse(rows[0].RequestJson || '{}'), result: JSON.parse(rows[0].ResultJson || 'null') };
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return null;
    throw error;
  }
}

export async function getEwayBillPdfData(invoiceNo, environment) {
  if (!['production', 'sandbox'].includes(environment)) throw new Error('Invalid environment.');
  const [irnRecord, billRecord] = await Promise.all([
    readRecord(environment === 'production' ? 'webWhitebooksProductionIrn' : 'webWhitebooksSandboxIrn', invoiceNo),
    readRecord(environment === 'production' ? 'webWhitebooksProductionEwayBill' : 'webWhitebooksStandaloneEwayBill', invoiceNo),
  ]);
  let submission = billRecord;
  if (!submission && environment === 'sandbox') submission = await readRecord('webWhitebooksSandboxEwayBill', invoiceNo);
  if (!submission && irnRecord?.state === 'succeeded' && irnRecord.result?.EwbNo) {
    submission = { state: 'succeeded', request: irnRecord.request?.EwbDtls || {}, result: irnRecord.result };
  }
  if (submission?.state !== 'succeeded' || !/^\d{12}$/.test(String(submission?.result?.EwbNo || ''))) {
    throw new Error('Generate or reconcile and save a successful e-way bill before downloading its PDF.');
  }
  let transport = {};
  try {
    const rows = await query('SELECT TransportJson FROM webInvoiceEwayBillTransport WHERE InvoiceNo = ?', [invoiceNo]);
    transport = JSON.parse(rows[0]?.TransportJson || '{}');
  } catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
  // The generation snapshots are authoritative; current invoice data is only a labelled fallback.
  const invoice = await getInvoice(invoiceNo);
  if (!invoice.header) throw new Error('Invoice not found.');
  const base = makeEwayBillPdfData({ environment, submission, irnRecord, invoice, transport });
  const details = await getWhitebooksEwayBillDetails(base.number, environment);
  return enrichEwayBillPdfData(base, details);
}
