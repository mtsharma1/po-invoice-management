'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { dateText } from '@/lib/format';

export default function CustomerInvoiceWorkbench({ rows, selectedInvoice, selectedInvoiceNo, search }) {
  const router = useRouter();
  const [form, setForm] = useState(normaliseInvoice(selectedInvoice));
  const [mainSearchText, setMainSearchText] = useState(selectedInvoiceNo || selectedInvoice?.InvoiceNo || '');
  const [listSearchText, setListSearchText] = useState(search || '');
  const [message, setMessage] = useState('');
  const [qrSrc, setQrSrc] = useState('/qr.png');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setForm(normaliseInvoice(selectedInvoice));
    setMainSearchText(selectedInvoiceNo || selectedInvoice?.InvoiceNo || '');
    setQrSrc(selectedInvoice?.IRN ? qrUrl(selectedInvoice.IRN) : '/qr.png');
  }, [selectedInvoice, selectedInvoiceNo]);

  useEffect(() => {
    setListSearchText(search || '');
  }, [search]);

  const canPrint = useMemo(() => Boolean(form.InvoiceNo), [form.InvoiceNo]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function runMainSearch() {
    const params = new URLSearchParams();
    if (mainSearchText.trim()) params.set('invoiceNo', mainSearchText.trim());
    if (listSearchText.trim()) params.set('search', listSearchText.trim());
    router.push(`/customer-invoice${params.size ? `?${params}` : ''}`);
  }

  function runListSearch() {
    const params = new URLSearchParams();
    if (form.InvoiceNo) params.set('invoiceNo', form.InvoiceNo);
    if (listSearchText.trim()) params.set('search', listSearchText.trim());
    router.push(`/customer-invoice${params.size ? `?${params}` : ''}`);
  }

  function clearMainSearch() {
    setMessage('');
    setMainSearchText('');
    const params = new URLSearchParams();
    if (listSearchText.trim()) params.set('search', listSearchText.trim());
    router.push(`/customer-invoice${params.size ? `?${params}` : ''}`);
  }

  function clearListSearch() {
    setMessage('');
    setListSearchText('');
    const params = new URLSearchParams();
    if (form.InvoiceNo) params.set('invoiceNo', form.InvoiceNo);
    router.push(`/customer-invoice${params.size ? `?${params}` : ''}`);
  }

  function addNew() {
    setMessage('');
    router.push('/customer-invoice?new=1');
  }

  function selectInvoice(invoiceNo) {
    const params = new URLSearchParams();
    params.set('invoiceNo', invoiceNo);
    if (listSearchText.trim()) params.set('search', listSearchText.trim());
    router.push(`/customer-invoice?${params}`);
  }

  function saveInvoice() {
    startTransition(async () => {
      try {
        setMessage('Saving invoice...');
        const response = await fetch('/api/customer-invoice/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Save failed.');
        setMessage(result.message || 'Invoice saved.');
        router.push(`/customer-invoice?invoiceNo=${encodeURIComponent(result.invoiceNo)}`);
        router.refresh();
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  function generateQR() {
    startTransition(async () => {
      try {
        const response = await fetch('/api/customer-invoice/qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ irn: form.IRN, invoiceNo: form.InvoiceNo }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'QR generation failed.');
        setQrSrc(qrUrl(form.IRN));
        setMessage(result.message || 'QR preview refreshed.');
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  const exportHref = canPrint ? `/api/invoices/${encodeURIComponent(form.InvoiceNo)}/excel` : '';

  return (
    <section className="customer-invoice-access">
      <div className="customer-invoice-title">INVOICE FORM</div>

      <div className="customer-invoice-grid">
        <div className="customer-invoice-left">
          <div className="access-search-row main-search-row">
            <label>Search :</label>
            <input
              placeholder="Invoice No"
              value={mainSearchText}
              onChange={(event) => setMainSearchText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') runMainSearch();
              }}
            />
            <button className="filter-clear-btn" type="button" onClick={clearMainSearch} title="Clear main form search">Clear</button>
            {canPrint ? (
              <a className="access-command export-command" href={exportHref}>EXPORT TO EXL</a>
            ) : (
              <button className="access-command export-command" type="button" disabled>EXPORT TO EXL</button>
            )}
          </div>

          <div className="invoice-top-panel">
            <div className="invoice-basic-fields">
              <FormInput label="PO Barcode" value={form.POBarcode} onChange={(value) => updateField('POBarcode', value)} />
              <FormInput label="IRN No" value={form.IRN} onChange={(value) => updateField('IRN', value)} />
              <FormInput label="Ack No" value={form.AckNo} onChange={(value) => updateField('AckNo', value)} />
              <FormInput label="Ack Date" type="datetime-local" value={dateTimeInput(form.AckDate)} onChange={(value) => updateField('AckDate', value)} />
              <FormInput label="Invoice No" value={form.InvoiceNo} onChange={(value) => updateField('InvoiceNo', value)} />
              <FormInput label="Seal No." value={form.SealNo} onChange={(value) => updateField('SealNo', value)} />
              <FormInput label="Orde Number (POBarcode)." value={form.OrderNumber} onChange={(value) => updateField('OrderNumber', value)} />
              <FormInput label="Order Date (POApprovedDate:)" type="date" value={dateInput(form.OrderDate)} onChange={(value) => updateField('OrderDate', value)} />
            </div>

            <div className="invoice-tax-fields">
              <FormInput label="Invoice Date" type="date" value={dateInput(form.InvoiceDate)} onChange={(value) => updateField('InvoiceDate', value)} />
              <FormInput label="IGST Rate" type="number" value={form.IGSTRate} onChange={(value) => updateField('IGSTRate', value)} />
              <FormInput label="SGST Rate" type="number" value={form.SGST} onChange={(value) => updateField('SGST', value)} />
              <FormInput label="SGST Rate" type="number" value={form.CGST} onChange={(value) => updateField('CGST', value)} />
              <label className="invoice-check">
                <input
                  type="checkbox"
                  checked={Boolean(form.InterStateTax)}
                  onChange={(event) => updateField('InterStateTax', event.target.checked ? 1 : 0)}
                />
                <span>Inter State Tax</span>
              </label>
            </div>

            <div className="invoice-qr-box">
              <img src={qrSrc} alt="Invoice QR preview" />
              <button type="button" onClick={generateQR} disabled={isPending}>Generate QR</button>
            </div>
          </div>

          <div className="invoice-address-grid">
            <AddressBlock
              title="BILL FROM NAME"
              name={form.BillFromName}
              address={form.BillFromAddress}
              addressTitle="BILL FROM ADDRESS"
              onName={(value) => updateField('BillFromName', value)}
              onAddress={(value) => updateField('BillFromAddress', value)}
            />
            <AddressBlock
              title="DISPATCH FROM NAME"
              name={form.DispatchFromName}
              address={form.DispatchFromAddress}
              addressTitle="DISPATCH FROM ADDRESS"
              onName={(value) => updateField('DispatchFromName', value)}
              onAddress={(value) => updateField('DispatchFromAddress', value)}
            />
            <AddressBlock
              title="CONSIGNEE NAME"
              name={form.ConsigneeName}
              address={form.ConsigneeAddress}
              addressTitle="CONSIGNEE ADDRESS"
              onName={(value) => updateField('ConsigneeName', value)}
              onAddress={(value) => updateField('ConsigneeAddress', value)}
            />
            <AddressBlock
              title="DELIVERED TO NAME"
              name={form.DeliveredToName}
              address={form.DeliveredToAddress}
              addressTitle="DELIVERED TO ADDRESS"
              onName={(value) => updateField('DeliveredToName', value)}
              onAddress={(value) => updateField('DeliveredToAddress', value)}
            />
          </div>

          <div className="bank-panel">
            <div className="bank-title">BANK DETAILS</div>
            <div className="bank-grid">
              <FormInput label="AccountNo" value={form.AccountNo} onChange={(value) => updateField('AccountNo', value)} />
              <FormInput label="BankName" value={form.BankName} onChange={(value) => updateField('BankName', value)} />
              <FormInput label="BranchName" value={form.BranchName} onChange={(value) => updateField('BranchName', value)} />
              <FormInput label="IFSCCode" value={form.IFSCCode} onChange={(value) => updateField('IFSCCode', value)} />
            </div>
          </div>

          <div className="invoice-action-bar">
            <button type="button" onClick={addNew}>ADD NEW</button>
            <button type="button" onClick={saveInvoice} disabled={isPending}>SAVE</button>
            {canPrint ? (
              <Link href={`/invoices/${encodeURIComponent(form.InvoiceNo)}`}>PRINT</Link>
            ) : (
              <button type="button" disabled>PRINT</button>
            )}
          </div>
          {message ? <div className="dispatch-message">{message}</div> : null}
        </div>

        <aside className="customer-invoice-right">
          <div className="invoice-list-title">List of Invoice</div>
          <div className="access-search-row invoice-list-search-row">
            <label>Search :</label>
            <input
              placeholder="Invoice No"
              value={listSearchText}
              onChange={(event) => setListSearchText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') runListSearch();
              }}
            />
            <button className="filter-clear-btn" type="button" onClick={clearListSearch} title="Clear invoice list search">Clear</button>
          </div>
          <div className="invoice-list-scroll">
            <table className="mini-list-table">
              <thead>
                <tr>
                  <th>INVOICE ID</th>
                  <th>INVOICE NO</th>
                  <th>INVOICE DATE</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.InvoiceID}
                    onClick={() => selectInvoice(row.InvoiceNo)}
                    className={row.InvoiceNo === form.InvoiceNo ? 'active-invoice-row' : ''}
                  >
                    <td className="num">{row.InvoiceID}</td>
                    <td>{row.InvoiceNo}</td>
                    <td>{dateText(row.InvoiceDate)}</td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr><td colSpan="3">No invoice found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </aside>
      </div>
    </section>
  );
}

function FormInput({ label, value, onChange, type = 'text' }) {
  return (
    <label className="access-field">
      <span>{label}</span>
      <input type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function AddressBlock({ title, addressTitle, name, address, onName, onAddress }) {
  return (
    <div className="invoice-address-block">
      <h3>{title}</h3>
      <input value={name || ''} onChange={(event) => onName(event.target.value)} />
      <h3>{addressTitle}</h3>
      <textarea value={address || ''} onChange={(event) => onAddress(event.target.value)} />
    </div>
  );
}

function normaliseInvoice(invoice) {
  return { ...(invoice || {}) };
}

function dateInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function dateTimeInput(value) {
  if (!value) return '';
  const raw = String(value).replace(' ', 'T');
  return raw.slice(0, 16);
}

function qrUrl(value) {
  const text = String(value || '').trim();
  return text
    ? `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(text)}`
    : '/qr.png';
}
