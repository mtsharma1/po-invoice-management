'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { dateText, qty, text } from '@/lib/format';
import ActionIcon from './ActionIcon';

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
    <section className="dispatch-workbench shell-order-workbench">
      <div className="dispatch-command-panel">
        <div className="dispatch-command-heading">
          <div>
            <p>Shell order workspace</p>
            <h2>CREATE STOCK ALLOCATION</h2>
            <span>Create shell orders, synchronize stock and review final size-wise quantities.</span>
          </div>
          <span className={`dispatch-mode-badge ${selectedPO ? 'editing' : ''}`}>
            <i /> {selectedPO ? 'Purchase order selected' : 'Awaiting selection'}
          </span>
        </div>

        <div className="dispatch-selector-row">
          <label className="dispatch-modern-field dispatch-po-selector">
            <span>Purchase order</span>
            <div className="dispatch-po-control-row">
              <select value={selectedPO} onChange={(event) => selectPO(event.target.value)}>
                <option value="">Select PO Number</option>
                {poOptions.map((po) => (
                  <option key={po.POBarcode} value={po.POBarcode}>{po.POBarcode}</option>
                ))}
              </select>
              <button className="dispatch-po-clear-button" type="button" onClick={clearFilter} disabled={!selectedPO} title="Clear purchase order">
                <ActionIcon name="reset" /> Clear
              </button>
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

        <div className="dispatch-action-row shell-action-row">
          <div className="dispatch-action-group">
            <button className="dispatch-action primary" type="button" onClick={() => runPOAction('/api/shell-orders/create')} disabled={isPending}>
              <ActionIcon name="plus" /> Create Shell Order
            </button>
            <button className="dispatch-action secondary view" type="button" onClick={() => runPOAction('/api/shell-orders/refresh-stock')} disabled={isPending}>
              <ActionIcon name="refresh" /> Refresh Stock
            </button>
            <button className="dispatch-action secondary upload" type="button" onClick={updateAvailableStock} disabled={isPending}>
              <ActionIcon name="sync" /> Update Available Stock
            </button>
            <a className="dispatch-action ghost" href={exportUrl}>
              <ActionIcon name="download" /> Export to Excel
            </a>
          </div>
          <p className="shell-action-hint">{isPending ? 'Working…' : 'Stock values are synchronized from Tranzact.'}</p>
        </div>
      </div>

      {message ? <div className="dispatch-message"><span aria-hidden="true">i</span>{message}</div> : null}

      <div className="dispatch-data-panel">
        <div className="dispatch-data-heading">
          <div>
            <p>Stock allocation lines</p>
            <h3>{selectedPO || 'No purchase order selected'}</h3>
          </div>
          <span>{rows.length} item{rows.length === 1 ? '' : 's'}</span>
        </div>
        <div className="dispatch-grid-shell shell-order-grid-shell">
          <table className="dispatch-grid shell-order-grid">
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
            {rows.map((row) => (
              <tr key={row.SOID}>
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
                  <span aria-hidden="true">◇</span>
                  <strong>{selectedPO ? 'No shell order lines found' : 'Choose a purchase order to begin'}</strong>
                  <small>{selectedPO ? 'Create a shell order to generate the size-wise stock allocation.' : 'Shell order quantities and stock values will appear here.'}</small>
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
