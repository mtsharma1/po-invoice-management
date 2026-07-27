'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import ActionIcon from './ActionIcon';

const columns = [
  ['POID', 'POID'],
  ['POBarcode', 'PO Barcode'],
  ['POImportDate', 'PO import date'],
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
  ['DeliveryDuration', 'Delivery duration'],
  ['FactoryDispatchDate', 'Factory dispatch date'],
  ['path_display', 'Dropbox path'],
  ['ImageUrl', 'Image URL'],
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
  const [imageViewer, setImageViewer] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageSyncing, setImageSyncing] = useState(false);
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
      imageSearchQuery: row.VendorArticleName || row.VendorArticleNumber || row.StyleId || row.SKUCode || '',
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

  async function fetchDropboxImage() {
    if (!editor || imageLoading) return;
    try {
      setImageLoading(true);
      setMessage(`Searching Dropbox for "${editor.imageSearchQuery}"…`);
      const response = await fetch('/api/master/line/dropbox-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          POID: editor.POID,
          productName: editor.imageSearchQuery,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Dropbox image could not be fetched.');
      }
      setEditor((current) => ({
        ...current,
        path_display: result.path_display,
        ImageUrl: result.ImageUrl,
      }));
      setMessage(result.message);
      router.refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setImageLoading(false);
    }
  }

  async function syncMissingImages() {
    if (imageSyncing) return;
    try {
      setImageSyncing(true);
      setMessage('Checking missing and temporary image URLs in Dropbox…');
      const response = await fetch('/api/master/images/sync', {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Image URLs could not be updated.');
      }
      const failureText = result.failures?.length
        ? ` Not found: ${result.failures.map((failure) => failure.vendorArticleName).join(', ')}.`
        : '';
      setMessage(`${result.message}${failureText}`);
      setEditor(null);
      router.refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setImageSyncing(false);
    }
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
          {/* <div className="master-heading-metrics">
            <span><small>Records shown</small><strong>{data.rows.length.toLocaleString('en-IN')}</strong></span>
            <span><small>Purchase orders</small><strong>{data.purchaseOrders.length.toLocaleString('en-IN')}</strong></span>
          </div> */}
      </header>

      <div className="master-toolbar">
        <label>
          <span>PO BARCODE</span>
          <select value={selectedPO} onChange={(event) => selectPO(event.target.value)} disabled={isPending}>
            <option value="">All purchase orders</option>
            {data.purchaseOrders.map((po) => (
              <option key={po.POBarcode} value={po.POBarcode}>
                {po.POBarcode}
                {/* {po.POBarcode} · {Number(po.lineCount).toLocaleString('en-IN')} lines */}
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
        <button
          className="master-image-sync"
          type="button"
          onClick={syncMissingImages}
          disabled={imageSyncing || isPending || imageLoading}
        >
          <ImageSyncIcon /> {imageSyncing ? 'Updating images…' : 'Update missing image URLs'}
        </button>
        <div className="master-selection-summary">
          {selectedPO ? (
            <>
              <small>Selected purchase order</small>
              <strong>{selectedPO}</strong>
              {/* <span>{Number(selectedSummary?.lineCount || 0).toLocaleString('en-IN')} item lines · {Number(selectedSummary?.totalQty || 0).toLocaleString('en-IN')} units</span> */}
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
          <div className="master-image-editor">
            <div className="master-image-editor-heading">
              <div>
                <p>Product image</p>
                <h3>Dropbox image details</h3>
                <span>Search Dropbox first, then review or replace the stored values.</span>
              </div>
              {editor.ImageUrl ? (
                <button
                  className="master-image-view"
                  type="button"
                  onClick={() => setImageViewer({
                    url: editor.ImageUrl,
                    name: editor.VendorArticleName || `PO line ${editor.POID}`,
                  })}
                >
                  View image
                </button>
              ) : null}
            </div>
            <div className="master-image-search">
              <label>
                <span>Dropbox product-name search</span>
                <input
                  value={editor.imageSearchQuery || ''}
                  onChange={(event) => updateEditor('imageSearchQuery', event.target.value)}
                  placeholder="Vendor article name"
                />
              </label>
              <button type="button" onClick={fetchDropboxImage} disabled={imageLoading || isPending}>
                {imageLoading ? 'Fetching…' : editor.ImageUrl ? 'Refresh from Dropbox' : 'Fetch from Dropbox'}
              </button>
            </div>
            <div className="master-image-fields">
              <label>
                <span>Dropbox path_display</span>
                <input
                  value={editor.path_display || ''}
                  onChange={(event) => updateEditor('path_display', event.target.value)}
                  placeholder="/Product/Product.jpg"
                />
              </label>
              <label>
                <span>Image URL</span>
                <textarea
                  value={editor.ImageUrl || ''}
                  onChange={(event) => updateEditor('ImageUrl', event.target.value)}
                  placeholder="https://..."
                />
              </label>
            </div>
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
          {/* <span>{data.totalRows.toLocaleString('en-IN')} record{data.totalRows === 1 ? '' : 's'}</span> */}
        </div>
        {data.totalRows > data.rowLimit ? <p className="master-limit-note">Showing the first {data.rowLimit.toLocaleString('en-IN')} records. Select a PO Barcode to see its complete record set.</p> : null}
        <div className="master-table-wrap">
          <table className="master-table">
            <thead><tr><th className="master-action-column">Action</th>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.POID}>
                  <td className="master-action-column"><button type="button" onClick={() => editRow(row)}>Edit</button></td>
                  {columns.map(([field]) => (
                    <td key={field} className={numericField(field) ? 'num' : ''}>
                      {field === 'ImageUrl' && row.ImageUrl ? (
                        <button
                          className="master-image-link"
                          type="button"
                          title={row.ImageUrl}
                          onClick={() => setImageViewer({
                            url: row.ImageUrl,
                            name: row.VendorArticleName || `PO line ${row.POID}`,
                          })}
                        >
                          {row.ImageUrl}
                        </button>
                      ) : displayValue(field, row[field])}
                    </td>
                  ))}
                </tr>
              ))}
              {!data.rows.length ? <tr><td className="master-empty" colSpan={columns.length + 1}>No master records found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {imageViewer ? (
        <div className="master-image-modal" role="presentation" onMouseDown={() => setImageViewer(null)}>
          <section
            className="master-image-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Image for ${imageViewer.name}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div><p>Product image</p><h2>{imageViewer.name}</h2></div>
              <button type="button" onClick={() => setImageViewer(null)} aria-label="Close image viewer">
                <ActionIcon name="clear" />
              </button>
            </header>
            <div className="master-image-canvas">
              <img src={imageViewer.url} alt={imageViewer.name} />
            </div>
            <footer>
              <a href={imageViewer.url} target="_blank" rel="noreferrer">Open image in new tab</a>
              <button type="button" onClick={() => setImageViewer(null)}>Close</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function numericField(field) {
  return ['POID', 'MRP', 'Quantity', 'Rate', 'LandingPrice'].includes(field);
}

function displayValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'POImportDate') {
    const raw = String(value).replace('T', ' ');
    const date = raw.slice(0, 10);
    const time = raw.slice(11, 16);
    const [year, month, day] = date.split('-');
    if (year && month && day) return `${day}-${month}-${year}${time ? ` ${time}` : ''}`;
    return String(value);
  }
  if (field === 'DeliveryDuration') {
    const days = Number(value);
    return `${days.toLocaleString('en-IN')} ${days === 1 ? 'day' : 'days'}`;
  }
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

function ImageSyncIcon() {
  return (
    <svg className="action-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m5 17 4-4 3 3 2-2 5 5M18 3v4m-2-2h4" />
    </svg>
  );
}
