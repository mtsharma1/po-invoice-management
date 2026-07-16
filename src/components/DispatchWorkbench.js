'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { dateText, money, qty, text } from '@/lib/format';

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
      <div className="dispatch-toolbar">
        <div className="dispatch-field">
          <label>PURCHASE ORDER</label>
          <select value={selectedPO} onChange={(event) => selectPO(event.target.value)}>
            <option value="">Select PO Number</option>
            {poOptions.map((po) => (
              <option key={po.POBarcode} value={po.POBarcode}>{po.POBarcode}</option>
            ))}
          </select>
          <button className="mini-clear" type="button" onClick={clearFilter} title="Clear filter">Clear</button>
        </div>

        <div className="dispatch-buttons">
          <button type="button" onClick={() => runPOAction('/api/dispatch/view', 'view')} disabled={isPending}>
            VIEW
          </button>
          <button type="button" onClick={() => runPOAction('/api/dispatch/create', 'edit')} disabled={isPending}>
            CREATE DISPATCH
          </button>
          <button type="button" onClick={chooseUploadFile} disabled={isPending}>
            UPLOAD
          </button>
          <button type="button" onClick={postDispatch} disabled={isPending}>
            POST
          </button>
          <a href="/api/dispatch/template">OPEN TEMPLATE</a>
          <input
            ref={uploadInputRef}
            className="hidden-file-input"
            type="file"
            accept=".xlsx,.xls"
            onChange={uploadDispatchFile}
          />
        </div>

        <div className="dispatch-field invoice-placeholder">
          <label>INVOICE NO</label>
          <input
            value={invoiceNo}
            onChange={(event) => setInvoiceNo(event.target.value)}
            aria-label="Invoice number"
            placeholder="Enter invoice no"
          />
        </div>
      </div>

      <div className="dispatch-info-grid">
        <div className="dispatch-field">
          <label>PARTY</label>
          <textarea value={selectedPO ? text(poContext?.Party || poContext?.VendorName) : ''} readOnly />
        </div>
        <div className="dispatch-field ship-to">
          <label>SHIP TO</label>
          <textarea value={selectedPO ? text(poContext?.ShipTo) : ''} readOnly />
        </div>
      </div>

      {message ? <div className="dispatch-message">{message}</div> : null}

      <div className="dispatch-grid-shell">
        <table className="dispatch-grid">
          <thead>
            <tr>
              <th>POID</th>
              <th>POBarcode</th>
              <th>StyleId</th>
              <th>HSNCode</th>
              <th>VendorArticleName</th>
              <th>Size</th>
              <th>Colour</th>
              <th>MRP</th>
              <th>Quantity</th>
              <th>DispatchQty</th>
              <th>PendingQuantity</th>
              <th>DispatchDate</th>
              <th>DispatchNo</th>
              <th>InvoiceNo</th>
            </tr>
          </thead>
          <tbody>
            {draftRows.map((row, index) => (
              <tr key={row.WTDID || `${row.POID}-${index}`} className={index === 0 ? 'selected-row' : ''}>
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
                  {selectedPO ? 'No dispatch rows found. Click CREATE DISPATCH or VIEW.' : 'Select a PO Number to filter the dispatch grid.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
