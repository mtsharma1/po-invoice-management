'use client';

import { useEffect, useRef, useState } from 'react';

export default function PurchaseOrderCombobox({ id, purchaseOrders, value = '', onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const listRef = useRef(null);
  const search = query.trim().toLowerCase();
  const options = [
    ...(!search ? [{ value: '', label: 'All purchase orders' }] : []),
    ...purchaseOrders.filter(po => String(po.POBarcode ?? '').toLowerCase().includes(search))
      .map(po => ({ value: po.POBarcode, label: po.POBarcode })),
  ];
  const activeIndex = active < options.length ? active : -1;

  useEffect(() => {
    if (open && activeIndex >= 0) listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, query]);

  function close() { setOpen(false); setQuery(''); setActive(-1); }
  function choose(option) { close(); if (option.value !== value) onChange(option.value); }

  function keyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive(current => {
        if (!options.length) return -1;
        if (event.key === 'ArrowDown') return current < 0 ? 0 : Math.min(current + 1, options.length - 1);
        return current < 0 ? options.length - 1 : Math.max(current - 1, 0);
      });
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (activeIndex >= 0) choose(options[activeIndex]);
      else if (options.length === 1) choose(options[0]);
    } else if (event.key === 'Escape') {
      event.preventDefault(); close();
    }
  }

  return <div className="master-po-combobox">
    <input id={id} type="text" role="combobox" autoComplete="off"
      aria-autocomplete="list" aria-expanded={open && !disabled} aria-controls={`${id}-list`}
      aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
      placeholder={open ? 'Type to search purchase orders…' : 'All purchase orders'}
      value={open ? query : value} disabled={disabled}
      onFocus={() => { setOpen(true); setQuery(''); setActive(-1); }}
      onClick={() => setOpen(true)} onBlur={close} onKeyDown={keyDown}
      onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }} />
    <span className="master-po-caret" aria-hidden="true">▾</span>
    {open && !disabled ? <ul id={`${id}-list`} role="listbox" aria-label="Purchase orders" className="master-po-options" ref={listRef}>
      {options.map((option, index) => <li key={option.value} id={`${id}-option-${index}`} role="option"
        aria-selected={option.value === value} className={index === activeIndex ? 'active' : undefined}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
        {option.label}
      </li>)}
      {!options.length ? <li className="master-po-empty" role="presentation">No matching purchase orders</li> : null}
    </ul> : null}
  </div>;
}
