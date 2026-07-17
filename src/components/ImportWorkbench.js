'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { dateText, money, qty, text } from '@/lib/format';
import ActionIcon from './ActionIcon';

const columns = [
  ['POBarcode', 'PO BARCODE', 150],
  ['StyleId', 'STYLE ID', 110],
  ['SKUCode', 'SKU CODE', 150],
  ['HSNCode', 'HSN CODE', 110],
  ['Brand', 'BRAND', 120],
  ['GTIN', 'GTIN', 130],
  ['VendorArticleNumber', 'VENDOR ARTICLE NUMBER', 220],
  ['VendorArticleName', 'VENDOR ARTICLE NAME', 240],
  ['Size', 'SIZE', 90],
  ['Colour', 'COLOR', 110],
  ['MRP', 'MRP', 90, 'money'],
  ['Quantity', 'QUANTITY', 95, 'qty'],
  ['ListPriceFOBTransportExcise', 'LIST OF PRICE FOB TRANSPORT EXCISE', 150, 'money'],
  ['LandingPrice', 'LANDING PRICE', 120, 'money'],
  ['EstimatedDeliveryDate', 'ESTIMATED DELIVERY DATE', 150, 'date'],
  ['SKUId', 'SKU ID', 110],
  ['Category', 'CATEGORY', 130],
  ['CreditPeriod', 'CREDIT PERIOD', 120],
  ['MarginType', 'MARGIN TYPE', 120],
  ['AgreedMargin', 'AGREED MARGIN', 120, 'money'],
  ['GrossMargin', 'GROSS MARGIN', 120, 'money'],
  ['FOBAmount', 'FOB AMOUNT', 120, 'money'],
  ['TaxBCD', 'TAX BCD', 100, 'money'],
  ['TaxBCDAmount', 'TAX BCD AMOUNT', 130, 'money'],
  ['BuyingTaxIGST', 'BUYING TAX IGST', 140, 'money'],
  ['BuyingTaxIGSTAmount', 'BUYING TAX IGST AMOUNT', 170, 'money'],
  ['TaxSWT', 'TAX SWT', 100, 'money'],
  ['TaxSWTAmount', 'TAX SWT AMOUNT', 130, 'money'],
  ['SellingTax', 'SELLING TAX', 110, 'money'],
  ['SellingTaxCGST', 'SELLING TAX CGST', 150, 'money'],
  ['SellingTaxIGST', 'SELLING TAX IGST', 150, 'money'],
  ['SellingTaxIGSTAmount', 'SELLING TAX IGST AMOUNT', 180, 'money'],
  ['SellingTaxSGST', 'SELLING TAX SGST', 150, 'money'],
  ['SellingTaxSGSTAmount', 'SELLING TAX SGST AMOUNT', 180, 'money'],
  ['FactoryDispatchDate', 'FACTORY DISPATCH DATE', 160, 'date'],
];

export default function ImportWorkbench({ header, rows }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function chooseFile() {
    inputRef.current?.click();
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileName(file.name);

    startTransition(async () => {
      try {
        setMessage('Importing PO into preview...');
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/import/po', { method: 'POST', body: formData });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Import failed.');
        setMessage(`${result.message}. ${result.insertedRows} SKU row(s) ready to save.`);
        router.refresh();
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  function saveToDatabase() {
    startTransition(async () => {
      try {
        setMessage('Saving PO to database...');
        const response = await fetch('/api/import/save', { method: 'POST' });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Save failed.');
        setMessage(`${result.message} ${result.savedRows} SKU row(s) saved.`);
        router.refresh();
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  return (
    <section className="po-import-access">
      <div className="po-import-command-card">
        <div className="po-import-command-heading">
          <div>
            <p>Purchase order import</p>
            <h2>Load an Excel purchase order</h2>
            <span>Select a workbook, review the header and item rows, then save it to the live database.</span>
          </div>
            <div className="po-import-actions">
              <button className="po-import-primary po-import-upload" type="button" onClick={chooseFile} disabled={isPending}>
                <ActionIcon name="upload" /> {isPending ? 'Importing…' : 'Import PO'}
              </button>
              <button className="po-import-save" type="button" onClick={saveToDatabase} disabled={isPending || !rows.length}><ActionIcon name="save" /> Save to database</button>
              <a className="po-import-template" href="/api/import/template"><ActionIcon name="download" /> Download template</a>
              <input ref={inputRef} className="hidden-file-input" type="file" accept=".xlsx,.xls" onChange={uploadFile} />
          <span className={`po-import-status ${rows.length ? 'ready' : ''}`}>{rows.length ? `${rows.length} rows ready` : 'Waiting for file'}</span>
          </div>
        </div>


        {fileName ? <div className="po-import-file"><span>Selected workbook</span><strong>{fileName}</strong></div> : null}
        {message ? <div className="dispatch-message">{message}</div> : null}
      </div>

      <div className="po-import-header-card">
        <div className="po-import-card-heading">
          <div><p>Header preview</p><h3>Purchase order details</h3></div>
          <span>Read from Excel</span>
        </div>
        <div className="po-import-header-grid">
          <div className="po-import-left-fields">
            <PreviewField label="PO Barcode" value={header?.POBarcode} />
            <PreviewField label="Approved Date" value={dateText(header?.POApprovedDate)} />
            <PreviewField label="Purchase Type" value={header?.PurchaseType} />
            <PreviewField label="Delivery Date" value={dateText(header?.EstimatedDeliveryDate)} />
            <PreviewField label="Vendor Name" value={header?.VendorName} />
            <PreviewField label="Vendor GSTIN" value={header?.VendorGSTIN} />
          </div>
          <div className="po-import-right-fields">
            <PreviewMemo label="Bill To" value={header?.BillTo} />
            <PreviewMemo label="Ship To" value={header?.ShipTo} />
            <PreviewMemo label="Vendor Address" value={header?.VendorAddress} />
          </div>
        </div>
      </div>

      <div className="po-import-grid-heading">
        <div><p>Item preview</p><h3>Imported purchase-order lines</h3></div>
        <span>{rows.length} {rows.length === 1 ? 'line' : 'lines'}</span>
      </div>

      <div className="po-import-grid-shell">
        <table className="po-import-grid">
          <thead>
            <tr>
              {columns.map(([, label, width]) => (
                <th key={label} style={{ width, minWidth: width }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.WTID}>
                {columns.map(([key, , , type]) => (
                  <td key={key} className={type === 'money' || type === 'qty' ? 'num' : ''}>
                    {formatCell(row[key], type)}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={columns.length} className="empty-grid-cell">
                  Click Import PO to load the purchase order preview.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PreviewField({ label, value }) {
  return (
    <div className="po-preview-field">
      <label>{label}</label>
      <span>{text(value)}</span>
    </div>
  );
}

function PreviewMemo({ label, value }) {
  return (
    <div className="po-preview-field po-preview-memo">
      <label>{label}</label>
      <span>{text(value)}</span>
    </div>
  );
}

function formatCell(value, type) {
  if (type === 'money') return money(value);
  if (type === 'qty') return qty(value);
  if (type === 'date') return dateText(value);
  return text(value);
}
