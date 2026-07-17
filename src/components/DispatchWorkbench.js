'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { dateText, money, qty, text } from '@/lib/format';
import ActionIcon from './ActionIcon';

export default function DispatchWorkbench({ poOptions, selectedPO, poContext, rows, mode }) {
  const router = useRouter();
  const uploadInputRef = useRef(null);
  const [message, setMessage] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [draftRows, setDraftRows] = useState(rows);
  const [isPending, startTransition] = useTransition();
  const isEditMode = mode === 'edit';

  useEffect(() => {
    setDraftRows(rows);
  }, [rows]);

  function selectPO(value) {
    setMessage('');
    if (value) {
      router.push(`/dispatch?poBarcode=${encodeURIComponent(value)}`);
    } else {
      router.push('/dispatch');
    }
  }

  function clearFilter() {
    setMessage('');
    setInvoiceNo('');
    router.push('/dispatch');
  }

  async function postAction(url, body = {}) {
    setMessage('Working...');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'Action failed.');
    }
    return result;
  }

  function moveToMode(nextMode) {
    router.push(`/dispatch?poBarcode=${encodeURIComponent(selectedPO)}&mode=${nextMode}`);
    router.refresh();
  }

  function runPOAction(url, nextMode) {
    if (!selectedPO) {
      setMessage('Please select PO Number first.');
      return;
    }
    startTransition(async () => {
      try {
        const result = await postAction(url, { poBarcode: selectedPO });
        setMessage(result.message || 'Done.');
        moveToMode(nextMode);
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  function saveDispatchQty(row, value) {
    if (!isEditMode) return;
    startTransition(async () => {
      try {
        const result = await postAction('/api/dispatch/update-row', {
          poBarcode: selectedPO,
          draftId: row.WTDID,
          dispatchQty: value,
        });
        setMessage(result.message || 'Dispatch quantity updated.');
        router.refresh();
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  function changeDispatchQty(row, value) {
    const nextQty = Math.max(0, Number(value || 0));
    setDraftRows((currentRows) =>
      currentRows.map((currentRow) =>
        currentRow.WTDID === row.WTDID
          ? {
              ...currentRow,
              DispatchQty: nextQty,
              PendingQuantity: Number(currentRow.Quantity || 0) - nextQty,
            }
          : currentRow
      )
    );
  }

  function postDispatch() {
    if (!selectedPO) {
      setMessage('Please select PO Number first.');
      return;
    }
    if (!invoiceNo.trim()) {
      setMessage('Please enter an invoice number before posting.');
      return;
    }

    startTransition(async () => {
      try {
        const result = await postAction('/api/dispatch/post', {
          poBarcode: selectedPO,
          invoiceNo: invoiceNo.trim(),
        });
        setMessage(result.message || 'Dispatch posted.');
        setInvoiceNo('');
        moveToMode('view');
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  function chooseUploadFile() {
    if (!selectedPO) {
      setMessage('Please select PO Number first.');
      return;
    }
    uploadInputRef.current?.click();
  }

  async function uploadDispatchFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    startTransition(async () => {
      try {
        setMessage('Uploading dispatch file...');
        const formData = new FormData();
        formData.append('file', file);
        formData.append('poBarcode', selectedPO);

        const response = await fetch('/api/dispatch/upload', {
          method: 'POST',
          body: formData,
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
          throw new Error(result.error || 'Upload failed.');
        }

        setMessage(result.message || 'Dispatch file imported.');
        moveToMode('edit');
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  return (
    <section className="dispatch-workbench">
      <div className="dispatch-command-panel">
        <div className="dispatch-command-heading">
          <div>
            <p>Dispatch workspace</p>
            <h3>CREATE AND POST DISPATCH</h3>
            <span>Select a purchase order, prepare item quantities and link the dispatch to an invoice.</span>
          </div>
          <span className={`dispatch-mode-badge ${isEditMode ? 'editing' : ''}`}>
            <i /> {isEditMode ? 'Editing quantities' : selectedPO ? 'View mode' : 'Awaiting selection'}
          </span>
        </div>

        <div className="dispatch-selector-row">
          <label className="dispatch-modern-field dispatch-po-selector">
            <span>Purchase order</span>
            <div>
              <select value={selectedPO} onChange={(event) => selectPO(event.target.value)}>
                <option value="">Select PO Number</option>
                {poOptions.map((po) => (
                  <option key={po.POBarcode} value={po.POBarcode}>{po.POBarcode}</option>
                ))}
              </select>
              {selectedPO ? <button className="dispatch-clear" type="button" onClick={clearFilter} title="Clear purchase order">×</button> : null}
            </div>
          </label>

          <div className="dispatch-context-item">
            <span>Party</span>
            <strong>{selectedPO ? text(poContext?.Party || poContext?.VendorName) : 'Select a purchase order'}</strong>
          </div>

          <div className="dispatch-context-item ship-to">
            <span>Ship to</span>
            <strong>{selectedPO ? text(poContext?.ShipTo) : 'Delivery address will appear here'}</strong>
          </div>
        </div>

        <div className="dispatch-action-row">
          <div className="dispatch-action-group">
            <button className="dispatch-action primary" type="button" onClick={() => runPOAction('/api/dispatch/create', 'edit')} disabled={isPending}>
              <ActionIcon name="plus" /> Create dispatch
            </button>
            <button className="dispatch-action secondary view" type="button" onClick={() => runPOAction('/api/dispatch/view', 'view')} disabled={isPending}>
              <ActionIcon name="view" /> View existing
            </button>
            <button className="dispatch-action secondary upload" type="button" onClick={chooseUploadFile} disabled={isPending}>
              <ActionIcon name="upload" /> Upload Excel
            </button>
            <a className="dispatch-action ghost" href="/api/dispatch/template">
              <ActionIcon name="download" /> Download template
            </a>
            <input
              ref={uploadInputRef}
              className="hidden-file-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={uploadDispatchFile}
            />
          </div>

          <div className="dispatch-post-group">
            <div className="dispatch-post-copy">
              <strong>Finalize dispatch</strong>
              <span>Enter the customer invoice number</span>
            </div>
            <label className="dispatch-modern-field">
              <span>Invoice number</span>
              <input
                value={invoiceNo}
                onChange={(event) => setInvoiceNo(event.target.value)}
                aria-label="Invoice number"
                placeholder="Enter invoice no"
              />
            </label>
            <button className="dispatch-post-button" type="button" onClick={postDispatch} disabled={isPending}>
              {isPending ? 'Working…' : 'Post dispatch'} <ActionIcon name="arrow" />
            </button>
          </div>
        </div>
      </div>

      {message ? <div className="dispatch-message"><span aria-hidden="true">i</span>{message}</div> : null}

      <div className="dispatch-data-panel">
        <div className="dispatch-data-heading">
          <div>
            <p>Shipment lines</p>
            <h3>{selectedPO || 'No purchase order selected'}</h3>
          </div>
          <span>{isEditMode ? 'Edit DispatchQty and press Enter to save' : `${draftRows.length} item${draftRows.length === 1 ? '' : 's'}`}</span>
        </div>
        <div className="dispatch-grid-shell">
          <table className="dispatch-grid">
          <thead>
            <tr>
              <th>PO ID</th>
              <th>PO Barcode</th>
              <th>Style ID</th>
              <th>HSN Code</th>
              <th>Vendor Article</th>
              <th>Size</th>
              <th>Colour</th>
              <th>MRP</th>
              <th>Quantity</th>
              <th>Dispatch Qty</th>
              <th>Pending Qty</th>
              <th>Dispatch Date</th>
              <th>Dispatch No.</th>
              <th>Invoice No.</th>
            </tr>
          </thead>
          <tbody>
            {draftRows.map((row, index) => (
              <tr key={row.WTDID || `${row.POID}-${index}`}>
                <td>{row.POID}</td>
                <td>{row.POBarcode}</td>
                <td>{row.StyleId}</td>
                <td>{row.HSNCode}</td>
                <td>{row.VendorArticleName}</td>
                <td>{row.Size}</td>
                <td>{row.Colour}</td>
                <td className="num">{money(row.MRP)}</td>
                <td className="num">{qty(row.Quantity)}</td>
                <td className="num editable-dispatch-cell">
                  {isEditMode ? (
                    <input
                      type="number"
                      min="0"
                      value={row.DispatchQty ?? 0}
                      onChange={(event) => changeDispatchQty(row, event.target.value)}
                      onBlur={(event) => saveDispatchQty(row, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  ) : (
                    qty(row.DispatchQty)
                  )}
                </td>
                <td className="num">{qty(row.PendingQuantity)}</td>
                <td>{dateText(row.DispatchDate)}</td>
                <td>{row.DispatchNo}</td>
                <td>{row.InvoiceNo}</td>
              </tr>
            ))}
            {!draftRows.length ? (
              <tr>
                <td colSpan="14" className="empty-grid-cell">
                  <span aria-hidden="true">↗</span>
                  <strong>{selectedPO ? 'No dispatch lines found' : 'Choose a purchase order to begin'}</strong>
                  <small>{selectedPO ? 'Create a new dispatch or view previously posted rows.' : 'The shipment lines and quantities will appear here.'}</small>
                </td>
              </tr>
            ) : null}
          </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
