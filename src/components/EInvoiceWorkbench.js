'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ActionIcon from './ActionIcon';

const supplyTypes = [
  ['B2B', 'B2B — Business to business'],
  ['SEZWP', 'SEZ with payment'],
  ['SEZWOP', 'SEZ without payment'],
  ['EXPWP', 'Export with payment'],
  ['EXPWOP', 'Export without payment'],
  ['DEXP', 'Deemed export'],
];

const documentTypes = [
  ['INV', 'Tax invoice'],
  ['CRN', 'Credit note'],
  ['DBN', 'Debit note'],
];

export default function EInvoiceWorkbench({ rows, initialDraft, initialValidation, selectedInvoiceNo, search }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [validation, setValidation] = useState(initialValidation);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setDraft(initialDraft);
    setValidation(initialValidation);
    setMessage('');
  }, [initialDraft, initialValidation, selectedInvoiceNo]);

  const status = useMemo(() => {
    if (!validation) return { label: 'Not validated', kind: 'neutral' };
    if (validation.valid) return { label: 'Validation passed', kind: 'success' };
    return { label: `${validation.errors.length} validation error${validation.errors.length === 1 ? '' : 's'}`, kind: 'error' };
  }, [validation]);

  function update(section, field, value) {
    setDraft((current) => ({ ...current, [section]: { ...current[section], [field]: value } }));
    setValidation(null);
    setMessage('Changes need validation.');
  }

  function updateSupply(value) {
    setDraft((current) => {
      const isExport = value === 'EXPWP' || value === 'EXPWOP';
      return {
        ...current,
        tran: { ...current.tran, SupTyp: value },
        buyer: isExport ? { ...current.buyer, Gstin: 'URP', Pos: '96', Stcd: '96', Pin: 999999 } : current.buyer,
        exportDetails: { ...current.exportDetails, enabled: isExport || current.exportDetails.enabled },
      };
    });
    setValidation(null);
    setMessage('Changes need validation.');
  }

  function selectInvoice(invoiceNo) {
    router.push(`/e-invoice?invoiceNo=${encodeURIComponent(invoiceNo)}`);
  }

  async function runPreparation(download) {
    if (!draft) return;
    if (download && draft.irn && !window.confirm('IRN is already generated. Do you want to prepare json file?')) return;

    startTransition(async () => {
      try {
        setMessage(download ? 'Preparing JSON…' : 'Validating invoice…');
        const response = await fetch('/api/e-invoice/prepare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceNo: draft.invoiceNo, draft }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'E-invoice preparation failed.');
        setValidation(result);
        if (!result.valid) {
          setMessage('Validation failed. Correct the listed fields before preparing JSON.');
          return;
        }
        if (!download) {
          setMessage(`Validation passed for ${result.summary.itemCount} item${result.summary.itemCount === 1 ? '' : 's'}.`);
          return;
        }
        const blob = new Blob([JSON.stringify([result.document], null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = result.fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setMessage(`${result.fileName} prepared successfully.`);
      } catch (error) {
        setMessage(error.message || 'E-invoice preparation failed.');
      }
    });
  }

  return (
    <section className="einvoice-workspace">
      <aside className="einvoice-list-panel">
        <div className="einvoice-list-heading">
          <div><p>Invoice source</p><h2>Select invoice</h2></div>
          <span>{rows.length}</span>
        </div>
        <form className="einvoice-search" method="get">
          <input name="search" defaultValue={search} placeholder="Invoice, PO or consignee" aria-label="Search invoices" />
          <button type="submit"><ActionIcon name="search" /> Search</button>
          {search ? <Link href="/e-invoice"><ActionIcon name="reset" /> Clear</Link> : null}
        </form>
        <div className="einvoice-list-scroll">
          <table>
            <thead><tr><th>Invoice</th><th>Date</th><th>Items</th><th>IRN</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.InvoiceID} className={row.InvoiceNo === selectedInvoiceNo ? 'active' : ''} onClick={() => selectInvoice(row.InvoiceNo)}>
                  <td><strong>{row.InvoiceNo}</strong><small>{row.ConsigneeName || row.DeliveredToName || 'Consignee in address'}</small></td>
                  <td>{shortDate(row.InvoiceDate)}</td>
                  <td>{row.lineCount}</td>
                  <td><span className={`einvoice-irn-dot ${clean(row.IRN) ? 'ready' : ''}`} title={clean(row.IRN) ? 'IRN generated' : 'IRN not generated'} /></td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan="4" className="einvoice-empty-row">No invoice found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </aside>

      <div className="einvoice-main">
        {!draft ? (
          <div className="einvoice-empty">
            <span aria-hidden="true">{'{}'}</span>
            <h2>Select an invoice to begin</h2>
            <p>The page will map database values, validate the complete document and prepare portal-ready JSON.</p>
          </div>
        ) : (
          <>
            <div className="einvoice-hero">
              <div>
                <p>E-invoice workbench</p>
                <h2>{draft.invoiceNo}</h2>
                <span>{draft.sourceSummary.lineCount} items · Buyer source: {draft.sourceSummary.buyerSource}</span>
              </div>
              <div className="einvoice-hero-status">
                {draft.irn ? <span className="einvoice-existing-irn">IRN already generated</span> : null}
                <span className={`einvoice-validation-badge ${status.kind}`}>{status.label}</span>
              </div>
            </div>

            <div className="einvoice-actionbar">
              <button type="button" className="einvoice-validate" onClick={() => runPreparation(false)} disabled={isPending}>
                <ActionIcon name="refresh" /> {isPending ? 'Working…' : 'Validate'}
              </button>
              <button type="button" className="einvoice-download" onClick={() => runPreparation(true)} disabled={isPending}>
                <ActionIcon name="download" /> Prepare JSON
              </button>
              <Link href={`/invoices/${encodeURIComponent(draft.invoiceNo)}`}><ActionIcon name="view" /> View invoice</Link>
              {message ? <p>{message}</p> : null}
            </div>

            <Section title="Transaction & document" subtitle="Choose the IRP scenario; database identifiers remain linked to the selected invoice.">
              <div className="einvoice-form-grid cols-4">
                <Field label="Supply type"><select value={draft.tran.SupTyp} onChange={(event) => updateSupply(event.target.value)}>{supplyTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Document type"><select value={draft.doc.Typ} onChange={(event) => update('doc', 'Typ', event.target.value)}>{documentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Document number"><input value={draft.doc.No} onChange={(event) => update('doc', 'No', event.target.value)} /></Field>
                <Field label="Document date"><input value={draft.doc.Dt} onChange={(event) => update('doc', 'Dt', event.target.value)} placeholder="DD/MM/YYYY" /></Field>
                <Field label="Reverse charge"><select value={draft.tran.RegRev} onChange={(event) => update('tran', 'RegRev', event.target.value)}><option value="N">No</option><option value="Y">Yes</option></select></Field>
                <Field label="IGST on intra-state"><select value={draft.tran.IgstOnIntra} onChange={(event) => update('tran', 'IgstOnIntra', event.target.value)}><option value="N">No</option><option value="Y">Yes</option></select></Field>
                <Field label="E-commerce GSTIN"><input value={draft.tran.EcmGstin} onChange={(event) => update('tran', 'EcmGstin', event.target.value.toUpperCase())} placeholder="Optional" /></Field>
                <Field label="Existing IRN"><input value={draft.irn || 'Not generated'} readOnly title={draft.irn} /></Field>
              </div>
            </Section>

            <div className="einvoice-party-grid">
              <PartyEditor title="Seller details" section="seller" party={draft.seller} update={update} />
              <PartyEditor title="Buyer details" subtitle="Always populated from Consignee Address" section="buyer" party={draft.buyer} update={update} includePos />
            </div>

            <Section title="Additional locations" subtitle="Dispatch-from and ship-to sections are included only when enabled.">
              <div className="einvoice-toggle-row">
                <Toggle checked={draft.dispatch.enabled} onChange={(checked) => update('dispatch', 'enabled', checked)} label="Include Dispatch From" />
                <Toggle checked={draft.shipping.enabled} onChange={(checked) => update('shipping', 'enabled', checked)} label="Include Ship To" />
              </div>
              <div className="einvoice-party-grid compact">
                {draft.dispatch.enabled ? <PartyEditor title="Dispatch From" section="dispatch" party={draft.dispatch} update={update} hideContact hideGstin /> : null}
                {draft.shipping.enabled ? <PartyEditor title="Ship To" section="shipping" party={draft.shipping} update={update} hideContact /> : null}
              </div>
            </Section>

            <Section title="Export / SEZ details" subtitle="Available for export and special economic zone documents.">
              <div className="einvoice-toggle-row"><Toggle checked={draft.exportDetails.enabled} onChange={(checked) => update('exportDetails', 'enabled', checked)} label="Include export details" /></div>
              {draft.exportDetails.enabled ? (
                <div className="einvoice-form-grid cols-4">
                  <Field label="Shipping bill no"><input value={draft.exportDetails.ShipBNo} onChange={(event) => update('exportDetails', 'ShipBNo', event.target.value)} /></Field>
                  <Field label="Shipping bill date"><input value={draft.exportDetails.ShipBDt} onChange={(event) => update('exportDetails', 'ShipBDt', event.target.value)} placeholder="DD/MM/YYYY" /></Field>
                  <Field label="Port code"><input value={draft.exportDetails.Port} onChange={(event) => update('exportDetails', 'Port', event.target.value.toUpperCase())} /></Field>
                  <Field label="Refund claim"><select value={draft.exportDetails.RefClm} onChange={(event) => update('exportDetails', 'RefClm', event.target.value)}><option value="N">No</option><option value="Y">Yes</option></select></Field>
                  <Field label="Foreign currency"><input value={draft.exportDetails.ForCur} onChange={(event) => update('exportDetails', 'ForCur', event.target.value.toUpperCase())} maxLength={3} /></Field>
                  <Field label="Country code"><input value={draft.exportDetails.CntCode} onChange={(event) => update('exportDetails', 'CntCode', event.target.value.toUpperCase())} maxLength={2} /></Field>
                  <Field label="Export duty"><input type="number" step="0.01" value={draft.exportDetails.ExpDuty} onChange={(event) => update('exportDetails', 'ExpDuty', event.target.value)} /></Field>
                </div>
              ) : null}
            </Section>

            <Section title="E-Way Bill details" subtitle="Enable this section when e-way-bill data should be included in the same JSON.">
              <div className="einvoice-toggle-row"><Toggle checked={draft.ewayBill.enabled} onChange={(checked) => update('ewayBill', 'enabled', checked)} label="Include e-way-bill details" /></div>
              {draft.ewayBill.enabled ? (
                <div className="einvoice-form-grid cols-4">
                  <Field label="Transporter ID"><input value={draft.ewayBill.TransId} onChange={(event) => update('ewayBill', 'TransId', event.target.value.toUpperCase())} /></Field>
                  <Field label="Transporter name"><input value={draft.ewayBill.TransName} onChange={(event) => update('ewayBill', 'TransName', event.target.value)} /></Field>
                  <Field label="Distance (km)"><input type="number" min="0" max="4000" value={draft.ewayBill.Distance} onChange={(event) => update('ewayBill', 'Distance', event.target.value)} /></Field>
                  <Field label="Mode"><select value={draft.ewayBill.TransMode} onChange={(event) => update('ewayBill', 'TransMode', event.target.value)}><option value="1">Road</option><option value="2">Rail</option><option value="3">Air</option><option value="4">Ship</option></select></Field>
                  <Field label="Transport document no"><input value={draft.ewayBill.TransDocNo} onChange={(event) => update('ewayBill', 'TransDocNo', event.target.value)} /></Field>
                  <Field label="Transport document date"><input value={draft.ewayBill.TransDocDt} onChange={(event) => update('ewayBill', 'TransDocDt', event.target.value)} placeholder="DD/MM/YYYY" /></Field>
                  <Field label="Vehicle number"><input value={draft.ewayBill.VehNo} onChange={(event) => update('ewayBill', 'VehNo', event.target.value.toUpperCase())} /></Field>
                  <Field label="Vehicle type"><select value={draft.ewayBill.VehType} onChange={(event) => update('ewayBill', 'VehType', event.target.value)}><option value="R">Regular</option><option value="O">Over-dimensional cargo</option></select></Field>
                </div>
              ) : null}
            </Section>

            <ValidationPanel validation={validation} />
            <ItemsPanel items={validation?.items || initialValidation?.items || []} values={validation?.values || initialValidation?.values} />
          </>
        )}
      </div>
    </section>
  );
}

function Section({ title, subtitle, children }) {
  return <section className="einvoice-section"><header><div><h3>{title}</h3><p>{subtitle}</p></div></header><div className="einvoice-section-body">{children}</div></section>;
}

function Field({ label, children }) {
  return <label className="einvoice-field"><span>{label}</span>{children}</label>;
}

function Toggle({ checked, onChange, label }) {
  return <label className="einvoice-toggle"><input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function PartyEditor({ title, subtitle, section, party, update, includePos = false, hideContact = false, hideGstin = false }) {
  return (
    <section className="einvoice-party-card">
      <header><div><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div><span>{party.Stcd || '—'}</span></header>
      <div className="einvoice-form-grid cols-2">
        {!hideGstin ? <Field label="GSTIN"><input value={party.Gstin} onChange={(event) => update(section, 'Gstin', event.target.value.toUpperCase())} /></Field> : null}
        {includePos ? <Field label="Place of supply"><input value={party.Pos} onChange={(event) => update(section, 'Pos', event.target.value)} maxLength={2} /></Field> : null}
        <Field label="Legal name"><input value={party.LglNm} onChange={(event) => update(section, 'LglNm', event.target.value)} /></Field>
        <Field label="Trade name"><input value={party.TrdNm} onChange={(event) => update(section, 'TrdNm', event.target.value)} /></Field>
        <Field label="Address line 1"><input value={party.Addr1} onChange={(event) => update(section, 'Addr1', event.target.value)} /></Field>
        <Field label="Address line 2"><input value={party.Addr2} onChange={(event) => update(section, 'Addr2', event.target.value)} /></Field>
        <Field label="Location"><input value={party.Loc} onChange={(event) => update(section, 'Loc', event.target.value)} /></Field>
        <Field label="PIN"><input value={party.Pin} onChange={(event) => update(section, 'Pin', event.target.value)} maxLength={6} /></Field>
        <Field label="State code"><input value={party.Stcd} onChange={(event) => update(section, 'Stcd', event.target.value)} maxLength={2} /></Field>
        {!hideContact ? <Field label="Phone"><input value={party.Ph} onChange={(event) => update(section, 'Ph', event.target.value)} /></Field> : null}
        {!hideContact ? <Field label="Email"><input value={party.Em} onChange={(event) => update(section, 'Em', event.target.value)} /></Field> : null}
      </div>
    </section>
  );
}

function ValidationPanel({ validation }) {
  if (!validation) return <section className="einvoice-validation-panel neutral"><h3>Validation required</h3><p>Run validation after reviewing or changing any field.</p></section>;
  return (
    <section className={`einvoice-validation-panel ${validation.valid ? 'success' : 'error'}`}>
      <header><div><h3>{validation.valid ? 'Validation passed' : 'Validation errors'}</h3><p>{validation.valid ? 'The document is ready for JSON preparation.' : 'Correct all errors and validate again.'}</p></div><strong>{validation.errors.length}</strong></header>
      {validation.errors.length ? <ul>{validation.errors.map((entry, index) => <li key={`${entry.code}-${index}`}><b>{entry.section}{entry.item ? ` · Row ${entry.item}` : ''}</b><span>{entry.message}</span></li>)}</ul> : null}
      {validation.warnings.length ? <div className="einvoice-warning-list"><h4>Warnings</h4><ul>{validation.warnings.map((entry, index) => <li key={`${entry.code}-${index}`}>{entry.message}</li>)}</ul></div> : null}
    </section>
  );
}

function ItemsPanel({ items, values }) {
  if (!items.length) return null;
  return (
    <Section title="Mapped item rows" subtitle="Product quantities and values are read from dispatched invoice lines; standard pieces use NOS.">
      <div className="einvoice-item-scroll"><table className="einvoice-item-table"><thead><tr><th>Sl</th><th>Description</th><th>HSN</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Taxable</th><th>GST</th><th>Tax</th><th>Total</th></tr></thead><tbody>{items.map((item) => <tr key={item.SlNo}><td>{item.SlNo}</td><td>{item.PrdDesc}</td><td>{item.HsnCd}</td><td className="num">{item.Qty}</td><td>{item.Unit}</td><td className="num">{money(item.UnitPrice)}</td><td className="num">{money(item.AssAmt)}</td><td className="num">{item.GstRt}%</td><td className="num">{money(item.IgstAmt + item.CgstAmt + item.SgstAmt)}</td><td className="num">{money(item.TotItemVal)}</td></tr>)}</tbody>{values ? <tfoot><tr><td colSpan="6">Invoice totals</td><td className="num">{money(values.AssVal)}</td><td /><td className="num">{money(values.IgstVal + values.CgstVal + values.SgstVal)}</td><td className="num">{money(values.TotInvVal)}</td></tr></tfoot> : null}</table></div>
    </Section>
  );
}

function money(value) {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortDate(value) {
  if (!value) return '—';
  const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
}

function clean(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return ['null', 'undefined'].includes(text.toLowerCase()) ? '' : text;
}
