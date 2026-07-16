'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { dateText, qty, text } from '@/lib/format';

export default function ShellOrderWorkbench({ poOptions, selectedPO, poContext, rows }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function selectPO(value) {
    setMessage('');
    if (value) {
      router.push(`/shell-orders?poBarcode=${encodeURIComponent(value)}`);
    } else {
      router.push('/shell-orders');
    }
  }

  function clearFilter() {
    setMessage('');
    router.push('/shell-orders');
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

  function runPOAction(url) {
    if (!selectedPO) {
      setMessage('Please select PO Number first.');
      return;
    }
    startTransition(async () => {
      try {
        const result = await postAction(url, { poBarcode: selectedPO });
        setMessage(result.message || 'Done.');
        router.refresh();
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  function updateAvailableStock() {
    startTransition(async () => {
      try {
        const result = await postAction('/api/shell-orders/update-available-stock');
        setMessage(result.message || 'Available stock updated.');
        router.refresh();
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  const exportUrl = selectedPO
    ? `/api/shell-orders/export?poBarcode=${encodeURIComponent(selectedPO)}`
    : '/api/shell-orders/export';

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
          <button type="button" onClick={() => runPOAction('/api/shell-orders/create')} disabled={isPending}>
            CREATE SHELL ORDER
          </button>
          <button type="button" onClick={() => runPOAction('/api/shell-orders/refresh-stock')} disabled={isPending}>
            REFRESH STOCK
          </button>
          <button type="button" onClick={updateAvailableStock} disabled={isPending}>
            UPDATE AVAILABLE STOCK
          </button>
          <a href={exportUrl}>EXPORT TO EXCEL</a>
        </div>

        <div className="dispatch-field invoice-placeholder">
          <label>INVOICE NO</label>
          <input value="" readOnly aria-label="Invoice number placeholder" />
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
              <th>SOID</th>
              <th>POID</th>
              <th>POBarcode</th>
              <th>AvailableStock</th>
              <th>FactoryDispatchDate</th>
              <th>S01</th>
              <th>M02</th>
              <th>L03</th>
              <th>TotalQty</th>
              <th>ShellQTY_S</th>
              <th>ShellQTY_M</th>
              <th>ShellQTY_L</th>
              <th>TRANZACT_QTY_S</th>
              <th>TRANZACT_QTY_M</th>
              <th>TRANZACT_QTY_L</th>
              <th>FINAL QTY_S</th>
              <th>FINAL QTY_M</th>
              <th>FINAL QTY_L</th>
              <th>Size</th>
              <th>Colour</th>
              <th>VendorArticleName</th>
              <th>SKUCode</th>
              <th>ParentSKU</th>
              <th>ParentSKUSize</th>
              <th>Quantity</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.SOID} className={index === 0 ? 'selected-row' : ''}>
                <td>{row.SOID}</td>
                <td>{row.POID}</td>
                <td>{row.POBarcode}</td>
                <td className="num">{qty(row.AvailableStock)}</td>
                <td>{dateText(row.FactoryDispatchDate)}</td>
                <td className="num">{qty(row.S01)}</td>
                <td className="num">{qty(row.M02)}</td>
                <td className="num">{qty(row.L03)}</td>
                <td className="num">{qty(row.TotalQty)}</td>
                <td className="num">{qty(row.ShellQTY_S)}</td>
                <td className="num">{qty(row.ShellQTY_M)}</td>
                <td className="num">{qty(row.ShellQTY_L)}</td>
                <td className="num">{qty(row.TRANZACT_QTY_S)}</td>
                <td className="num">{qty(row.TRANZACT_QTY_M)}</td>
                <td className="num">{qty(row.TRANZACT_QTY_L)}</td>
                <td className="num">{qty(row.FINAL_QTY_S)}</td>
                <td className="num">{qty(row.FINAL_QTY_M)}</td>
                <td className="num">{qty(row.FINAL_QTY_L)}</td>
                <td>{row.Size}</td>
                <td>{row.Colour}</td>
                <td>{row.VendorArticleName}</td>
                <td>{row.SKUCode}</td>
                <td>{row.ParentSKU}</td>
                <td className="num">{qty(row.ParentSKUSize)}</td>
                <td className="num">{qty(row.Quantity)}</td>
                <td>{row.Category}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan="26" className="empty-grid-cell">
                  {selectedPO ? 'No shell order rows found for this PO. Click CREATE SHELL ORDER.' : 'Select a PO Number to filter the shell order grid.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
