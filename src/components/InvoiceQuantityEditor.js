'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money } from '@/lib/format';
import { lineTaxRates } from '@/lib/invoiceTax';
import ActionIcon from './ActionIcon';
import SearchableCombobox from './SearchableCombobox';

function itemLabel(item) {
  return [item.sku, item.colour, item.size, `PO line ${item.poid}`].filter(Boolean).join(' · ');
}

function quantityLabel(quantity) {
  return `${quantity} ${quantity === 1 ? 'unit' : 'units'}`;
}

function remainingQuantity(maximum, value) {
  if (!/^\d+$/.test(value)) return '—';
  return Math.max(0, maximum - Number(value));
}

function taxPercent(item, amount) {
  try {
    return `${lineTaxRates(item.taxHeader, { ...item.taxLine, Amount: amount }).taxRate}%`;
  } catch {
    return '—';
  }
}

function initialValues(items) {
  return Object.fromEntries((items ?? []).filter(item => item.onInvoice).map(item => [item.poid, String(item.quantity)]));
}

export default function InvoiceQuantityEditor({ invoiceNo, initialItems, backHref }) {
  const router = useRouter();
  const quantityHintId = useId();
  const [open, setOpen] = useState(Boolean(initialItems));
  const [itemState, setItemState] = useState(null);
  // A server refresh supplies current PO details. Local updates only apply to the snapshot they were made against.
  const items = itemState && itemState.source === initialItems ? itemState.items : initialItems ?? null;
  const [values, setValues] = useState(() => initialValues(initialItems));
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const endpoint = `/api/invoices/${encodeURIComponent(invoiceNo)}/quantities`;

  async function start() {
    setOpen(true);
    setError('');
    setBusy(true);
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load PO quantities.');
      setItemState({ source: initialItems, items: data.items });
      setValues(initialValues(data.items));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    setSaved('');
    const visible = items.filter(item => Object.hasOwn(values, item.poid));
    const changes = [];
    let hasQuantity = false;
    for (const item of visible) {
      const value = values[item.poid];
      const quantity = Number(value);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(quantity) || quantity > item.max) {
        setError(`${itemLabel(item)} requires a whole number from 0 to ${item.max}.`);
        return;
      }
      if (quantity > 0) hasQuantity = true;
      if (quantity !== item.quantity) changes.push({ poid: item.poid, quantity, previousQuantity: item.quantity });
    }
    if (!hasQuantity) {
      setError('Keep at least one item on the invoice.');
      return;
    }
    if (!changes.length) {
      if (!initialItems) close();
      return;
    }
    await persistChanges(changes);
  }

  async function deleteItem(item) {
    const message = item.onInvoice
      ? `Delete ${itemLabel(item)} from this invoice and return ${quantityLabel(item.quantity)} to the PO?`
      : `Remove ${itemLabel(item)} from the items being added?`;
    if (!window.confirm(message)) return;

    setError('');
    setSaved('');
    if (!item.onInvoice) {
      setValues(current => {
        const next = { ...current };
        delete next[item.poid];
        return next;
      });
      return;
    }
    await persistChanges([{ poid: item.poid, quantity: 0, previousQuantity: item.quantity }], item);
  }

  async function persistChanges(changes, deletedItem) {
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save invoice quantities.');
      if (initialItems || deletedItem) {
        const applied = new Map(changes.map(change => [change.poid, change.quantity]));
        const updatedItems = items.map(item => applied.has(item.poid)
          ? { ...item, quantity: applied.get(item.poid), onInvoice: applied.get(item.poid) > 0 }
          : item);
        setItemState({ source: initialItems, items: updatedItems });
        if (deletedItem) {
          setValues(current => {
            const next = { ...current };
            delete next[deletedItem.poid];
            return next;
          });
          setSaved(`${deletedItem.sku} was deleted. Returned ${quantityLabel(deletedItem.quantity)} to the PO.`);
        } else {
          setValues(initialValues(updatedItems));
          setSaved('Quantities saved. The PO balance has been updated.');
        }
      } else {
        close();
      }
      router.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setItemState(null);
    setSelected('');
    setError('');
    setOpen(false);
  }

  if (!open) {
    return <div className="action-row invoice-quantity-editor"><button className="btn" type="button" onClick={start}>Edit quantities</button></div>;
  }
  const visible = items?.filter(item => Object.hasOwn(values, item.poid)) ?? [];
  const available = items?.filter(item => item.max > 0 && item.canAdd && !Object.hasOwn(values, item.poid)) ?? [];
  const skuChoices = available.map(item => {
    const label = `${itemLabel(item)} (${item.max} available)`;
    return { value: String(item.poid), label, searchText: [label, item.article, item.styleId].filter(Boolean).join(' ') };
  });
  const skuSearchId = `${quantityHintId}-sku`;

  return (
    <section className="panel invoice-quantity-editor" aria-labelledby="invoice-quantities-title">
      <div className="invoice-quantity-heading">
        <h2 id="invoice-quantities-title">Invoice items</h2>
        {items ? <p>Set a quantity to 0 to remove the item and return its units to the PO.</p> : null}
      </div>
      {error ? <p className="invoice-quantity-feedback error" role="alert">{error}</p> : null}
      {saved ? <p className="invoice-quantity-feedback" role="status">{saved}</p> : null}
      {!items ? (
        <div className="action-row">
          <button className="btn primary" type="button" onClick={start} disabled={busy}>{busy ? 'Loading…' : 'Retry'}</button>
          <button className="btn" type="button" onClick={close} disabled={busy}>Cancel</button>
        </div>
      ) : (
        <form onSubmit={save}>
          <fieldset className="invoice-quantity-fields" disabled={busy}>
            {available.length > 0 ? (
              <div className="invoice-quantity-add">
                <div className="invoice-sku-picker">
                  <label htmlFor={skuSearchId}>Add SKU from this PO</label>
                  <SearchableCombobox
                    id={skuSearchId}
                    choices={skuChoices}
                    value={selected}
                    onChange={setSelected}
                    disabled={busy}
                    placeholder="Search or select a SKU"
                    searchPlaceholder="Type to filter SKUs…"
                    listLabel="Available PO items"
                    noMatches="No matching SKUs"
                  />
                </div>
                <button className="btn invoice-editor-button invoice-editor-add" type="button" disabled={!skuChoices.some(choice => choice.value === selected)} onClick={() => {
                  setSaved('');
                  setValues({ ...values, [selected]: '1' });
                  setSelected('');
                }}><ActionIcon name="plus" /> Add SKU</button>
              </div>
            ) : null}
            <div className="table-wrap">
              <table className="invoice-quantity-table">
                <thead>
                  <tr>
                    <th scope="col">Sl. No.</th>
                    <th scope="col">SKU Code</th>
                    <th scope="col">Style ID</th>
                    <th scope="col">HSN Code</th>
                    <th scope="col">Vendor Article Name</th>
                    <th scope="col">Colour</th>
                    <th scope="col">Size</th>
                    <th scope="col" className="quantity-number">MRP</th>
                    <th scope="col" className="quantity-number">Rate</th>
                    <th scope="col" className="quantity-number">Tax %</th>
                    <th scope="col">Quantity</th>
                    <th scope="col" className="quantity-number">Amount</th>
                    <th scope="col" className="invoice-item-action">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item, index) => {
                    const value = values[item.poid];
                    const remaining = remainingQuantity(item.max, value);
                    const hintId = `${quantityHintId}-${item.poid}`;
                    const amount = Number.isFinite(item.rate) && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
                      ? Number(value) * item.rate : null;
                    return (
                    <tr key={item.poid}>
                      <td>{index + 1}</td>
                      <th scope="row">{item.sku || '—'}</th>
                      <td>{item.styleId || '—'}</td>
                      <td>{item.hsnCode || '—'}</td>
                      <td>{item.article || '—'}</td>
                      <td>{item.colour || '—'}</td>
                      <td>{item.size || '—'}</td>
                      <td className="quantity-number">{Number.isFinite(item.mrp) ? money(item.mrp) : '—'}</td>
                      <td className="quantity-number">{Number.isFinite(item.rate) ? money(item.rate) : '—'}</td>
                      <td className="quantity-number">{amount === null ? '—' : taxPercent(item, amount)}</td>
                      <td>
                        <input
                          aria-label={`Quantity for ${itemLabel(item)}`}
                          aria-describedby={hintId}
                          type="number" min="0" max={item.max} step="1" required
                          value={value}
                          onChange={event => {
                            setSaved('');
                            setValues({ ...values, [item.poid]: event.target.value });
                          }}
                        />
                        <small className="invoice-quantity-available" id={hintId}>
                          Available: {remaining}
                        </small>
                      </td>
                      <td className="quantity-number invoice-line-amount">{amount === null ? '—' : money(amount)}</td>
                      <td className="invoice-item-action">
                        <button className="invoice-item-delete" type="button" title="Delete item" aria-label={`Delete ${itemLabel(item)}`} onClick={() => deleteItem(item)}>
                          <ActionIcon name="trash" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="invoice-quantity-actions">
              {backHref ? <Link className="invoice-edit-back" href={backHref}>Back to invoices</Link>
                : <button className="btn secondary" type="button" onClick={close}>Cancel</button>}
              <button className="btn invoice-editor-button invoice-editor-save" type="submit"><ActionIcon name="save" />{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
