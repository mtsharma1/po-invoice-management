'use client';

import Link from 'next/link';
import { cloneElement, useEffect, useMemo, useState, useTransition } from 'react';
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

const stateOptions = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'],
  ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'],
  ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'],
  ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'],
  ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'],
  ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'],
  ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'],
  ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'],
  ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
  ['96', 'Other Country'], ['97', 'Other Territory'],
];

const directErrorFields = {
  'Transaction:SUPPLY_TYPE': ['tran.SupTyp'],
  'Transaction:REVERSE_CHARGE': ['tran.RegRev'],
  'Transaction:IGST_ON_INTRA': ['tran.IgstOnIntra'],
  'Transaction:ECOM_GSTIN': ['tran.EcmGstin'],
  'Document:DOCUMENT_TYPE': ['doc.Typ'],
  'Document:DOCUMENT_NUMBER': ['doc.No'],
  'Document:DOCUMENT_DATE': ['doc.Dt'],
  'Document:FUTURE_DATE': ['doc.Dt'],
  'Buyer:BUYER_GSTIN': ['buyer.Gstin'],
  'Buyer:EXPORT_GSTIN': ['buyer.Gstin'],
  'Buyer:PLACE_OF_SUPPLY': ['buyer.Pos'],
  'Buyer:EXPORT_POS': ['buyer.Pos'],
  'Buyer:CONSIGNEE_ADDRESS': ['buyer.Addr1'],
  'Export:CURRENCY': ['exportDetails.ForCur'],
  'Export:COUNTRY': ['exportDetails.CntCode'],
  'Export:SHIPPING_BILL_DATE': ['exportDetails.ShipBDt'],
  'Export:PORT_CODE': ['exportDetails.Port'],
  'E-Way Bill:TRANSPORTER': ['ewayBill.TransId', 'ewayBill.TransName'],
  'E-Way Bill:TRANSPORTER_ID': ['ewayBill.TransId'],
  'E-Way Bill:DISTANCE': ['ewayBill.Distance'],
  'E-Way Bill:MODE': ['ewayBill.TransMode'],
  'E-Way Bill:VEHICLE_TYPE': ['ewayBill.VehType'],
  'E-Way Bill:TRANSPORT_DATE': ['ewayBill.TransDocDt'],
  'E-Way Bill:VEHICLE_NUMBER': ['ewayBill.VehNo'],
};

const partySections = {
  Seller: 'seller',
  Buyer: 'buyer',
  'Dispatch From': 'dispatch',
  'Ship To': 'shipping',
};

const partyErrorFields = {
  GSTIN_REQUIRED: 'Gstin',
  GSTIN_INVALID: 'Gstin',
  GSTIN_STATE: 'Gstin',
  LEGAL_NAME: 'LglNm',
  NAME: 'LglNm',
  ADDRESS1: 'Addr1',
  ADDRESS2: 'Addr2',
  LOCATION: 'Loc',
  PIN: 'Pin',
  STATE: 'Stcd',
  PHONE: 'Ph',
  EMAIL: 'Em',
};

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
    if (validation.stale) return { label: 'Changes need validation', kind: 'neutral' };
    if (validation.valid) return { label: 'Validation passed', kind: 'success' };
    return { label: `${validation.errors.length} validation error${validation.errors.length === 1 ? '' : 's'}`, kind: 'error' };
  }, [validation]);

  const errorsByField = useMemo(() => {
    const grouped = {};
    validation?.errors?.forEach((entry) => {
      errorFieldKeys(entry).forEach((fieldKey) => {
        grouped[fieldKey] = [...(grouped[fieldKey] || []), entry];
      });
    });
    return grouped;
  }, [validation]);

  const errorsFor = (fieldKey) => errorsByField[fieldKey] || [];

  function update(section, field, value) {
    setDraft((current) => ({ ...current, [section]: { ...current[section], [field]: value } }));
    setValidation((current) => current ? { ...current, stale: true } : current);
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
    setValidation((current) => current ? { ...current, stale: true } : current);
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
          const firstEditableError = result.errors.find((entry) => errorFieldKeys(entry).length);
          if (firstEditableError) {
            requestAnimationFrame(() => requestAnimationFrame(() => focusValidationError(firstEditableError)));
          }
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
            <thead><tr><th>Invoice</th><th>Date</th><th>Qty</th><th>IRN</th></tr></thead>
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
            <div className="einvoice-command-card">
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
                {message ? <p role="status">{message}</p> : null}
              </div>
            </div>

            <Section title="Transaction & document" subtitle="Choose the IRP scenario; database identifiers remain linked to the selected invoice.">
              <div className="einvoice-form-grid cols-4">
                <Field label="Supply type" fieldKey="tran.SupTyp" errors={errorsFor('tran.SupTyp')}><select value={draft.tran.SupTyp} onChange={(event) => updateSupply(event.target.value)}>{supplyTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Document type" fieldKey="doc.Typ" errors={errorsFor('doc.Typ')}><select value={draft.doc.Typ} onChange={(event) => update('doc', 'Typ', event.target.value)}>{documentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Document number" fieldKey="doc.No" errors={errorsFor('doc.No')}><input value={draft.doc.No} onChange={(event) => update('doc', 'No', event.target.value)} /></Field>
                <Field label="Document date" fieldKey="doc.Dt" errors={errorsFor('doc.Dt')}><input value={draft.doc.Dt} onChange={(event) => update('doc', 'Dt', event.target.value)} placeholder="DD/MM/YYYY" /></Field>
                <Field label="Reverse charge" fieldKey="tran.RegRev" errors={errorsFor('tran.RegRev')}><select value={draft.tran.RegRev} onChange={(event) => update('tran', 'RegRev', event.target.value)}><option value="N">No</option><option value="Y">Yes</option></select></Field>
                <Field label="IGST on intra-state" fieldKey="tran.IgstOnIntra" errors={errorsFor('tran.IgstOnIntra')}><select value={draft.tran.IgstOnIntra} onChange={(event) => update('tran', 'IgstOnIntra', event.target.value)}><option value="N">No</option><option value="Y">Yes</option></select></Field>
                <Field label="E-commerce GSTIN" fieldKey="tran.EcmGstin" errors={errorsFor('tran.EcmGstin')}><input value={draft.tran.EcmGstin} onChange={(event) => update('tran', 'EcmGstin', event.target.value.toUpperCase())} placeholder="Optional" /></Field>
                <Field label="Existing IRN"><input value={draft.irn || 'Not generated'} readOnly title={draft.irn} /></Field>
              </div>
            </Section>

            <div className="einvoice-party-grid">
              <PartyEditor title="Seller details" section="seller" party={draft.seller} update={update} errorsFor={errorsFor} />
              <PartyEditor title="Buyer details" subtitle="Always populated from Consignee Address" section="buyer" party={draft.buyer} update={update} errorsFor={errorsFor} includePos />
            </div>

            <Section title="Additional locations" subtitle="Dispatch-from and ship-to sections are included only when enabled.">
              <div className="einvoice-toggle-row">
                <Toggle checked={draft.dispatch.enabled} onChange={(checked) => update('dispatch', 'enabled', checked)} label="Include Dispatch From" />
                <Toggle checked={draft.shipping.enabled} onChange={(checked) => update('shipping', 'enabled', checked)} label="Include Ship To" />
              </div>
              <div className="einvoice-party-grid compact">
                {draft.dispatch.enabled ? <PartyEditor title="Dispatch From" section="dispatch" party={draft.dispatch} update={update} errorsFor={errorsFor} hideContact hideGstin /> : null}
                {draft.shipping.enabled ? <PartyEditor title="Ship To" section="shipping" party={draft.shipping} update={update} errorsFor={errorsFor} hideContact /> : null}
              </div>
            </Section>

            <Section title="Export / SEZ details" subtitle="Available for export and special economic zone documents.">
              <div className="einvoice-toggle-row"><Toggle checked={draft.exportDetails.enabled} onChange={(checked) => update('exportDetails', 'enabled', checked)} label="Include export details" /></div>
              {draft.exportDetails.enabled ? (
                <div className="einvoice-form-grid cols-4">
                  <Field label="Shipping bill no"><input value={draft.exportDetails.ShipBNo} onChange={(event) => update('exportDetails', 'ShipBNo', event.target.value)} /></Field>
                  <Field label="Shipping bill date" fieldKey="exportDetails.ShipBDt" errors={errorsFor('exportDetails.ShipBDt')}><input value={draft.exportDetails.ShipBDt} onChange={(event) => update('exportDetails', 'ShipBDt', event.target.value)} placeholder="DD/MM/YYYY" /></Field>
                  <Field label="Port code" fieldKey="exportDetails.Port" errors={errorsFor('exportDetails.Port')}><input value={draft.exportDetails.Port} onChange={(event) => update('exportDetails', 'Port', event.target.value.toUpperCase())} /></Field>
                  <Field label="Refund claim"><select value={draft.exportDetails.RefClm} onChange={(event) => update('exportDetails', 'RefClm', event.target.value)}><option value="N">No</option><option value="Y">Yes</option></select></Field>
                  <Field label="Foreign currency" fieldKey="exportDetails.ForCur" errors={errorsFor('exportDetails.ForCur')}><input value={draft.exportDetails.ForCur} onChange={(event) => update('exportDetails', 'ForCur', event.target.value.toUpperCase())} maxLength={3} /></Field>
                  <Field label="Country code" fieldKey="exportDetails.CntCode" errors={errorsFor('exportDetails.CntCode')}><input value={draft.exportDetails.CntCode} onChange={(event) => update('exportDetails', 'CntCode', event.target.value.toUpperCase())} maxLength={2} /></Field>
                  <Field label="Export duty"><input type="number" step="0.01" value={draft.exportDetails.ExpDuty} onChange={(event) => update('exportDetails', 'ExpDuty', event.target.value)} /></Field>
                </div>
              ) : null}
            </Section>

            <Section title="E-Way Bill details" subtitle="Enable this section when e-way-bill data should be included in the same JSON.">
              <div className="einvoice-toggle-row"><Toggle checked={draft.ewayBill.enabled} onChange={(checked) => update('ewayBill', 'enabled', checked)} label="Include e-way-bill details" /></div>
              {draft.ewayBill.enabled ? (
                <div className="einvoice-form-grid cols-4">
                  <Field label="Transporter ID" fieldKey="ewayBill.TransId" errors={errorsFor('ewayBill.TransId')}><input value={draft.ewayBill.TransId} onChange={(event) => update('ewayBill', 'TransId', event.target.value.toUpperCase())} /></Field>
                  <Field label="Transporter name" fieldKey="ewayBill.TransName" errors={errorsFor('ewayBill.TransName')}><input value={draft.ewayBill.TransName} onChange={(event) => update('ewayBill', 'TransName', event.target.value)} /></Field>
                  <Field label="Distance (km)" fieldKey="ewayBill.Distance" errors={errorsFor('ewayBill.Distance')}><input type="number" min="0" max="4000" value={draft.ewayBill.Distance} onChange={(event) => update('ewayBill', 'Distance', event.target.value)} /></Field>
                  <Field label="Mode" fieldKey="ewayBill.TransMode" errors={errorsFor('ewayBill.TransMode')}><select value={draft.ewayBill.TransMode} onChange={(event) => update('ewayBill', 'TransMode', event.target.value)}><option value="1">Road</option><option value="2">Rail</option><option value="3">Air</option><option value="4">Ship</option></select></Field>
                  <Field label="Transport document no"><input value={draft.ewayBill.TransDocNo} onChange={(event) => update('ewayBill', 'TransDocNo', event.target.value)} /></Field>
                  <Field label="Transport document date" fieldKey="ewayBill.TransDocDt" errors={errorsFor('ewayBill.TransDocDt')}><input value={draft.ewayBill.TransDocDt} onChange={(event) => update('ewayBill', 'TransDocDt', event.target.value)} placeholder="DD/MM/YYYY" /></Field>
                  <Field label="Vehicle number" fieldKey="ewayBill.VehNo" errors={errorsFor('ewayBill.VehNo')}><input value={draft.ewayBill.VehNo} onChange={(event) => update('ewayBill', 'VehNo', event.target.value.toUpperCase())} /></Field>
                  <Field label="Vehicle type" fieldKey="ewayBill.VehType" errors={errorsFor('ewayBill.VehType')}><select value={draft.ewayBill.VehType} onChange={(event) => update('ewayBill', 'VehType', event.target.value)}><option value="R">Regular</option><option value="O">Over-dimensional cargo</option></select></Field>
                </div>
              ) : null}
            </Section>

            <ValidationPanel validation={validation} onSelectError={focusValidationError} />
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

function Field({ label, fieldKey, errors = [], children }) {
  const hasError = errors.length > 0;
  const controlId = fieldKey ? fieldControlId(fieldKey) : undefined;
  const errorId = hasError ? `${controlId}-error` : undefined;
  const control = cloneElement(children, {
    id: controlId,
    'data-field-key': fieldKey,
    'aria-invalid': hasError ? 'true' : undefined,
    'aria-describedby': errorId,
  });
  return (
    <label className={`einvoice-field ${hasError ? 'has-error' : ''}`} htmlFor={controlId}>
      <span>{label}{hasError ? <b>Needs attention</b> : null}</span>
      {control}
      {hasError ? <small id={errorId} className="einvoice-field-error">{errors.map((entry) => entry.message).join(' ')}</small> : null}
    </label>
  );
}

function Toggle({ checked, onChange, label }) {
  return <label className="einvoice-toggle"><input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function PartyEditor({ title, subtitle, section, party, update, errorsFor, includePos = false, hideContact = false, hideGstin = false }) {
  const fieldErrors = (field) => errorsFor?.(`${section}.${field}`) || [];
  return (
    <section className="einvoice-party-card">
      <header><div><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div><span>{party.Stcd || '—'}</span></header>
      <div className="einvoice-form-grid cols-2">
        {!hideGstin ? <Field label="GSTIN" fieldKey={`${section}.Gstin`} errors={fieldErrors('Gstin')}><input value={party.Gstin} onChange={(event) => update(section, 'Gstin', event.target.value.toUpperCase())} /></Field> : null}
        {includePos ? <Field label="Place of supply" fieldKey={`${section}.Pos`} errors={fieldErrors('Pos')}><StateSelect value={party.Pos} onChange={(value) => update(section, 'Pos', value)} /></Field> : null}
        <Field label="Legal name" fieldKey={`${section}.LglNm`} errors={fieldErrors('LglNm')}><input value={party.LglNm} onChange={(event) => update(section, 'LglNm', event.target.value)} /></Field>
        <Field label="Trade name" fieldKey={`${section}.TrdNm`} errors={fieldErrors('TrdNm')}><input value={party.TrdNm} onChange={(event) => update(section, 'TrdNm', event.target.value)} /></Field>
        <Field label="Address line 1" fieldKey={`${section}.Addr1`} errors={fieldErrors('Addr1')}><input value={party.Addr1} onChange={(event) => update(section, 'Addr1', event.target.value)} /></Field>
        <Field label="Address line 2" fieldKey={`${section}.Addr2`} errors={fieldErrors('Addr2')}><input value={party.Addr2} onChange={(event) => update(section, 'Addr2', event.target.value)} /></Field>
        <Field label="Location" fieldKey={`${section}.Loc`} errors={fieldErrors('Loc')}><input value={party.Loc} onChange={(event) => update(section, 'Loc', event.target.value)} /></Field>
        <Field label="PIN" fieldKey={`${section}.Pin`} errors={fieldErrors('Pin')}><input value={party.Pin} onChange={(event) => update(section, 'Pin', event.target.value)} maxLength={6} /></Field>
        <Field label="State code" fieldKey={`${section}.Stcd`} errors={fieldErrors('Stcd')}><StateSelect value={party.Stcd} onChange={(value) => update(section, 'Stcd', value)} /></Field>
        {!hideContact ? <Field label="Phone" fieldKey={`${section}.Ph`} errors={fieldErrors('Ph')}><input value={party.Ph} onChange={(event) => update(section, 'Ph', event.target.value)} /></Field> : null}
        {!hideContact ? <Field label="Email" fieldKey={`${section}.Em`} errors={fieldErrors('Em')}><input value={party.Em} onChange={(event) => update(section, 'Em', event.target.value)} /></Field> : null}
      </div>
    </section>
  );
}

function StateSelect({ value, onChange, ...inputProps }) {
  return (
    <select {...inputProps} value={value || ''} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select state</option>
      {stateOptions.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
    </select>
  );
}

function ValidationPanel({ validation, onSelectError }) {
  if (!validation) return <section className="einvoice-validation-panel neutral"><h3>Validation required</h3><p>Run validation after reviewing or changing any field.</p></section>;
  return (
    <section className={`einvoice-validation-panel ${validation.valid ? 'success' : 'error'}`}>
      <header><div><h3>{validation.valid ? 'Validation passed' : 'Validation errors'}</h3><p>{validation.valid ? 'The document is ready for JSON preparation.' : 'Correct all errors and validate again.'}</p></div><strong>{validation.errors.length}</strong></header>
      {validation.errors.length ? <ul>{validation.errors.map((entry, index) => {
        const editable = errorFieldKeys(entry).length > 0;
        const content = <><b>{entry.section}{entry.item ? ` · Row ${entry.item}` : ''}</b><span>{entry.message}</span>{editable ? <em>Show field →</em> : null}</>;
        return <li key={`${entry.code}-${index}`} className={editable ? 'actionable' : ''}>{editable ? <button type="button" onClick={() => onSelectError(entry)}>{content}</button> : <div>{content}</div>}</li>;
      })}</ul> : null}
      {validation.warnings.length ? <div className="einvoice-warning-list"><h4>Warnings</h4><ul>{validation.warnings.map((entry, index) => <li key={`${entry.code}-${index}`}>{entry.message}</li>)}</ul></div> : null}
    </section>
  );
}

function errorFieldKeys(entry) {
  const direct = directErrorFields[`${entry.section}:${entry.code}`];
  if (direct) return direct;
  const section = partySections[entry.section];
  const field = partyErrorFields[entry.code];
  return section && field ? [`${section}.${field}`] : [];
}

function fieldControlId(fieldKey) {
  return `einvoice-field-${fieldKey.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
}

function focusValidationError(entry) {
  const fieldKey = errorFieldKeys(entry)[0];
  const control = fieldKey ? document.getElementById(fieldControlId(fieldKey)) : null;
  if (!control) return;
  control.scrollIntoView({ behavior: 'smooth', block: 'center' });
  control.focus({ preventScroll: true });
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
