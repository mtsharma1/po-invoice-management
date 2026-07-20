'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import ActionIcon from './ActionIcon';

const columns = [
  ['POID', 'POID'],
  ['POBarcode', 'PO Barcode'],
  ['StyleId', 'Style ID'],
  ['SKUCode', 'SKU Code'],
  ['HSNCode', 'HSN Code'],
  ['Brand', 'Brand'],
  ['GTIN', 'GTIN'],
  ['VendorArticleNumber', 'Vendor article number'],
  ['VendorArticleName', 'Vendor article name'],
  ['Size', 'Size'],
  ['Colour', 'Color'],
  ['MRP', 'MRP'],
  ['Quantity', 'Quantity'],
  ['Rate', 'List price FOB transport excise'],
  ['LandingPrice', 'Landing price'],
  ['EstimatedDeliveryDate', 'Estimated delivery date'],
  ['BillTo', 'Bill to'],
  ['ShipTo', 'Ship to'],
  ['FactoryDispatchDate', 'Factory dispatch date'],
];

const editorFields = [
  ['StyleId', 'Style ID'],
  ['SKUCode', 'SKU code'],
  ['HSNCode', 'HSN code'],
  ['Brand', 'Brand'],
  ['GTIN', 'GTIN'],
  ['VendorArticleNumber', 'Vendor article number'],
  ['VendorArticleName', 'Vendor article name'],
  ['Size', 'Size'],
  ['Colour', 'Color'],
  ['MRP', 'MRP', 'number'],
  ['Quantity', 'Quantity', 'number'],
  ['Rate', 'List price / rate', 'number'],
  ['LandingPrice', 'Landing price', 'number'],
  ['EstimatedDeliveryDate', 'Estimated delivery date', 'date'],
  ['FactoryDispatchDate', 'Factory dispatch date', 'date'],
];

export default function MasterWorkbench({ data, selectedPO }) {
  const router = useRouter();
  const [editor, setEditor] = useState(null);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();
  const selectedSummary = data.purchaseOrders.find((row) => row.POBarcode === selectedPO);

  function selectPO(value) {
    setEditor(null);
    setMessage('Loading purchase order…');
    router.push(value ? `/master?po=${encodeURIComponent(value)}` : '/master');
  }

  function editRow(row) {
    setMessage('');
    setEditor({
      ...row,
      EstimatedDeliveryDate: dateInputValue(row.EstimatedDeliveryDate),
      FactoryDispatchDate: dateInputValue(row.FactoryDispatchDate),
    });
  }

  function updateEditor(field, value) {
    setEditor((current) => ({ ...current, [field]: value }));
  }

  function saveLine() {
    if (!editor) return;
    startTransition(async () => {
      try {
        setMessage(`Saving PO line ${editor.POID}…`);
        const response = await fetch('/api/master/line/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editor),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'PO line could not be saved.');
        setMessage(result.message);
        setEditor(null);
        router.refresh();
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  function deletePO() {
    if (!selectedPO) return;
    const confirmed = window.confirm(
      `Delete purchase order "${selectedPO}"?\n\nIts Shell Order, Dispatch and PO detail records will also be permanently deleted.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        setMessage(`Deleting ${selectedPO}…`);
        const response = await fetch('/api/master/delete-po', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poBarcode: selectedPO }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Purchase order could not be deleted.');
        setEditor(null);
        router.push('/master');
        router.refresh();
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  return (
    <section className="master-workspace">
      <header className="master-heading">
        <div>
          <p>Purchase order master</p>
          <h1>MASTER DATA REGISTER</h1>
          <span>Review and maintain the complete PO item record used by Shell Orders, Dispatch and Invoices.</span>
        </div>
        <div className="master-heading-metrics">
          <span><small>Records shown</small><strong>{data.rows.length.toLocaleString('en-IN')}</strong></span>
          <span><small>Purchase orders</small><strong>{data.purchaseOrders.length.toLocaleString('en-IN')}</strong></span>
        </div>
      </header>

      <div className="master-toolbar">
        <label>
          <span>PO BARCODE</span>
          <select value={selectedPO} onChange={(event) => selectPO(event.target.value)} disabled={isPending}>
            <option value="">All purchase orders</option>
            {data.purchaseOrders.map((po) => (
              <option key={po.POBarcode} value={po.POBarcode}>
                {po.POBarcode} · {Number(po.lineCount).toLocaleString('en-IN')} lines
              </option>
            ))}
          </select>
        </label>
        <button className="master-clear" type="button" onClick={() => selectPO('')} disabled={!selectedPO || isPending}>
          <ActionIcon name="reset" /> Clear
        </button>
        <button className="master-delete" type="button" onClick={deletePO} disabled={!selectedPO || isPending}>
          <TrashIcon /> Delete PO
        </button>
        <div className="master-selection-summary">
          {selectedPO ? (
            <>
              <small>Selected purchase order</small>
              <strong>{selectedPO}</strong>
              <span>{Number(selectedSummary?.lineCount || 0).toLocaleString('en-IN')} item lines · {Number(selectedSummary?.totalQty || 0).toLocaleString('en-IN')} units</span>
            </>
          ) : (
            <><small>Current view</small><strong>All PO records</strong><span>Select a PO to filter or delete it.</span></>
          )}
        </div>
      </div>

      {message ? <div className="master-message" role="status"><span aria-hidden="true">i</span>{message}</div> : null}

      {editor ? (
        <section className="master-editor" aria-label={`Edit PO line ${editor.POID}`}>
          <div className="master-editor-heading">
            <div><p>Edit master record</p><h2>PO line {editor.POID}</h2><span>{editor.POBarcode}</span></div>
            <button type="button" onClick={() => setEditor(null)} aria-label="Close editor"><ActionIcon name="clear" /></button>
          </div>
          <div className="master-editor-grid">
            {editorFields.map(([field, label, type = 'text']) => (
              <label key={field}>
                <span>{label}</span>
                <input
                  type={type}
                  step={type === 'number' ? '0.01' : undefined}
                  min={type === 'number' ? '0' : undefined}
                  value={editor[field] ?? ''}
                  onChange={(event) => updateEditor(field, event.target.value)}
                />
              </label>
            ))}
            <label className="master-editor-wide"><span>Bill to</span><textarea value={editor.BillTo || ''} onChange={(event) => updateEditor('BillTo', event.target.value)} /></label>
            <label className="master-editor-wide"><span>Ship to</span><textarea value={editor.ShipTo || ''} onChange={(event) => updateEditor('ShipTo', event.target.value)} /></label>
          </div>
          <div className="master-editor-actions">
            <button className="master-save" type="button" onClick={saveLine} disabled={isPending}><ActionIcon name="save" /> {isPending ? 'Saving…' : 'Save changes'}</button>
            <button type="button" onClick={() => setEditor(null)} disabled={isPending}>Cancel</button>
          </div>
        </section>
      ) : null}

      <section className="master-table-panel">
        <div className="master-table-title">
          <div><p>Access record source</p><h2>{selectedPO ? 'Filtered PO details' : 'All PO details'}</h2></div>
          <span>{data.totalRows.toLocaleString('en-IN')} record{data.totalRows === 1 ? '' : 's'}</span>
        </div>
        {data.totalRows > data.rowLimit ? <p className="master-limit-note">Showing the first {data.rowLimit.toLocaleString('en-IN')} records. Select a PO Barcode to see its complete record set.</p> : null}
        <div className="master-table-wrap">
          <table className="master-table">
            <thead><tr><th className="master-action-column">Action</th>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.POID}>
                  <td className="master-action-column"><button type="button" onClick={() => editRow(row)}>Edit</button></td>
                  {columns.map(([field]) => <td key={field} className={numericField(field) ? 'num' : ''}>{displayValue(field, row[field])}</td>)}
                </tr>
              ))}
              {!data.rows.length ? <tr><td className="master-empty" colSpan={columns.length + 1}>No master records found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function numericField(field) {
  return ['POID', 'MRP', 'Quantity', 'Rate', 'LandingPrice'].includes(field);
}

function displayValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (['EstimatedDeliveryDate', 'FactoryDispatchDate'].includes(field)) {
    const raw = String(value).slice(0, 10);
    const [year, month, day] = raw.split('-');
    return year && month && day ? `${day}-${month}-${year}` : String(value);
  }
  if (['MRP', 'Rate', 'LandingPrice'].includes(field)) {
    return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (field === 'Quantity' || field === 'POID') return Number(value).toLocaleString('en-IN');
  return String(value);
}

function dateInputValue(value) {
  return value ? String(value).slice(0, 10) : '';
}

function TrashIcon() {
  return (
    <svg className="action-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6" />
    </svg>
  );
}
