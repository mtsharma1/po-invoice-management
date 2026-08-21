'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { dateText, money, qty, text } from '@/lib/format';
import ActionIcon from './ActionIcon';

const columns = [
  ['POBarcode', 'PO BARCODE', 150],
  ['StyleId', 'STYLE ID', 110],
  ['HSNCode', 'HSN CODE', 110],
  ['Brand', 'BRAND', 120],
  ['GTIN', 'GTIN', 130],
  ['VendorArticleName', 'VENDOR ARTICLE NAME', 240],
  ['Size', 'SIZE', 90],
  ['Colour', 'COLOR', 110],
  ['MRP', 'MRP', 90, 'money'],
  ['Quantity', 'QUANTITY', 95, 'qty'],
  ['ListPriceFOBTransportExcise', 'LIST OF PRICE FOB TRANSPORT EXCISE', 150, 'money'],
  ['LandingPrice', 'LANDING PRICE', 120, 'money'],
  ['EstimatedDeliveryDate', 'ESTIMATED DELIVERY DATE', 150, 'date'],
  ['SellingTaxCGST', 'SELLING TAX CGST', 150, 'money'],
  ['SellingTaxIGST', 'SELLING TAX IGST', 150, 'money'],
  ['SellingTaxIGSTAmount', 'SELLING TAX IGST AMOUNT', 180, 'money'],
  ['SellingTaxSGST', 'SELLING TAX SGST', 150, 'money'],
  ['SellingTaxSGSTAmount', 'SELLING TAX SGST AMOUNT', 180, 'money'],
  ['FactoryDispatchDate', 'FACTORY DISPATCH DATE', 160, 'date'],
  ['Category', 'CATEGORY', 160],
];

export default function ImportWorkbench({ header, rows }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const batchInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [batchFileNames, setBatchFileNames] = useState([]);
  const [batchResult, setBatchResult] = useState(null);
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [errorLogs, setErrorLogs] = useState([]);
  const [errorLogSearch, setErrorLogSearch] = useState('');
  const [errorLogMessage, setErrorLogMessage] = useState('');
  const [errorLogLoading, setErrorLogLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function chooseFile() {
    inputRef.current?.click();
  }

  function chooseBatchFiles() {
    batchInputRef.current?.click();
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

  async function uploadBatch(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setBatchFileNames(files.map((file) => file.name));
    setBatchResult(null);

    startTransition(async () => {
      try {
        setMessage(`Checking and importing ${files.length} PO file${files.length === 1 ? '' : 's'}...`);
        const formData = new FormData();
        files.forEach((file) => formData.append('files', file));
        const response = await fetch('/api/import/batch', { method: 'POST', body: formData });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Batch import failed.');
        setBatchResult(result);
        setMessage(result.message);
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

  function downloadErrorLog() {
    if (!batchResult?.errors?.length) return;
    const columns = [
      ['batchId', 'Batch ID'],
      ['fileName', 'File Name'],
      ['poBarcode', 'PO Barcode'],
      ['worksheet', 'Worksheet'],
      ['row', 'Excel Row'],
      ['field', 'Field / Column'],
      ['reason', 'Failure Reason'],
      ['dateTime', 'Date and Time'],
    ];
    const csvRows = [
      columns.map(([, label]) => csvCell(label)).join(','),
      ...batchResult.errors.map((entry) => columns.map(([key]) => (
        csvCell(key === 'dateTime' ? localDateTime(entry[key]) : entry[key])
      )).join(',')),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PO_Import_Error_Log_${batchResult.batchId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function loadErrorLogs() {
    setErrorLogLoading(true);
    setErrorLogMessage('');
    try {
      const response = await fetch('/api/import/logs?limit=1000', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to load the error log.');
      setErrorLogs(result.logs || []);
    } catch (error) {
      setErrorLogMessage(error.message);
    } finally {
      setErrorLogLoading(false);
    }
  }

  function toggleErrorLog() {
    const nextState = !showErrorLog;
    setShowErrorLog(nextState);
    if (nextState) loadErrorLogs();
  }

  const normalizedLogSearch = errorLogSearch.trim().toLowerCase();
  const visibleErrorLogs = normalizedLogSearch
    ? errorLogs.filter((entry) => [
      entry.fileName,
      entry.poBarcode,
      entry.batchId,
      entry.worksheet,
      entry.field,
      entry.reason,
    ].some((value) => String(value || '').toLowerCase().includes(normalizedLogSearch)))
    : errorLogs;

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
                <ActionIcon name="upload" /> Preview one PO
              </button>
              <button className="po-import-batch" type="button" onClick={chooseBatchFiles} disabled={isPending}>
                <ActionIcon name="upload" /> {isPending ? 'Importing…' : 'Import multiple POs'}
              </button>
              <button className="po-import-save" type="button" onClick={saveToDatabase} disabled={isPending || !rows.length}><ActionIcon name="save" /> Save to database</button>
              <a className="po-import-template" href="/api/import/template"><ActionIcon name="download" /> Download template</a>
              <button className="po-import-log-button" type="button" onClick={toggleErrorLog} aria-expanded={showErrorLog}>
                <ActionIcon name="view" /> {showErrorLog ? 'Close error log' : 'Error log'}
              </button>
              <input ref={inputRef} className="hidden-file-input" type="file" accept=".xlsx" onChange={uploadFile} />
              <input ref={batchInputRef} className="hidden-file-input" type="file" accept=".xlsx" multiple onChange={uploadBatch} />
          <span className={`po-import-status ${rows.length ? 'ready' : ''}`}>{rows.length ? `${rows.length} rows ready` : 'Waiting for file'}</span>
          </div>
        </div>


        {fileName ? <div className="po-import-file"><span>Selected workbook</span><strong>{fileName}</strong></div> : null}
        {batchFileNames.length ? (
          <div className="po-import-file po-import-batch-files">
            <span>Selected batch</span>
            <strong>{batchFileNames.length} files</strong>
            <small>{batchFileNames.join(', ')}</small>
          </div>
        ) : null}
        {message ? <div className="dispatch-message">{message}</div> : null}
        {batchResult ? (
          <div className="po-import-batch-result">
            <div className="po-import-batch-summary">
              <div><span>Processed</span><strong>{batchResult.processedFiles}</strong></div>
              <div className="success"><span>Imported</span><strong>{batchResult.successfulFiles}</strong></div>
              <div className={batchResult.failedFiles ? 'failed' : ''}><span>Failed</span><strong>{batchResult.failedFiles}</strong></div>
              {batchResult.errors?.length ? (
                <button type="button" onClick={downloadErrorLog}>
                  <ActionIcon name="download" /> Download error log
                </button>
              ) : null}
            </div>
            <div className="po-import-batch-table-wrap">
              <table className="po-import-batch-table">
                <thead><tr><th>File name</th><th>PO barcode</th><th>Status</th><th>Rows</th><th>Result</th></tr></thead>
                <tbody>
                  {batchResult.results.map((result, index) => (
                    <tr key={`${result.fileName}-${index}`}>
                      <td>{result.fileName}</td>
                      <td>{result.poBarcode || '—'}</td>
                      <td><span className={`po-import-result-status ${result.status}`}>{result.status === 'success' ? 'Imported' : 'Failed'}</span></td>
                      <td>{result.status === 'success' ? result.importedRows : '—'}</td>
                      <td>{result.status === 'success' ? `${result.assignedDispatchRows} dispatch date(s) assigned` : `${result.issueCount || 1} error(s): ${result.reason}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        {showErrorLog ? (
          <div className="po-import-error-log">
            <div className="po-import-error-log-heading">
              <div>
                <p>Import history</p>
                <h3>PO import error log</h3>
                <span>{visibleErrorLogs.length} of {errorLogs.length} records</span>
              </div>
              <div className="po-import-error-log-tools">
                <label>
                  <ActionIcon name="search" />
                  <input
                    type="search"
                    value={errorLogSearch}
                    onChange={(event) => setErrorLogSearch(event.target.value)}
                    placeholder="Search file, PO, field or reason"
                  />
                </label>
                <button type="button" onClick={loadErrorLogs} disabled={errorLogLoading}>
                  <ActionIcon name="refresh" /> {errorLogLoading ? 'Loading…' : 'Refresh'}
                </button>
                <button type="button" onClick={() => setShowErrorLog(false)}>
                  <ActionIcon name="clear" /> Close
                </button>
              </div>
            </div>
            {errorLogMessage ? <div className="dispatch-message">{errorLogMessage}</div> : null}
            <div className="po-import-error-log-table-wrap">
              <table className="po-import-error-log-table">
                <thead>
                  <tr>
                    <th>Date and time</th>
                    <th>File name</th>
                    <th>PO barcode</th>
                    <th>Worksheet</th>
                    <th>Excel row</th>
                    <th>Field / column</th>
                    <th>Failure reason</th>
                    <th>Batch ID</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleErrorLogs.map((entry) => (
                    <tr key={entry.errorLogId}>
                      <td>{localDateTime(entry.dateTime)}</td>
                      <td>{entry.fileName}</td>
                      <td>{entry.poBarcode || '—'}</td>
                      <td>{entry.worksheet || '—'}</td>
                      <td>{entry.excelRow || '—'}</td>
                      <td>{entry.field || '—'}</td>
                      <td>{entry.reason}</td>
                      <td>{entry.batchId}</td>
                    </tr>
                  ))}
                  {!errorLogLoading && !visibleErrorLogs.length ? (
                    <tr><td colSpan="8" className="empty-grid-cell">No PO import errors found.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
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
            <PreviewField label="Consignee Name" value={header?.ConsigneeName} />
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

function csvCell(value) {
  const normalized = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${normalized.replace(/"/g, '""')}"`;
}

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN');
}
