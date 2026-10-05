"use client";

import { useEffect, useRef, useState } from 'react';

export default function WhitebooksEwayBillAction({ invoiceNo, transport, draft, onValidation }) {
  const [submission, setSubmission] = useState(null);
  const [pending, setPending] = useState(false);
  const [foundBill, setFoundBill] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  const [environment, setEnvironment] = useState('sandbox');
  useEffect(() => {
    const controller = new AbortController();
    setSubmission(null); setFoundBill(null); setLoaded(false); setMessage('');
    fetch(`/api/whitebooks/ewaybill?invoiceNo=${encodeURIComponent(invoiceNo)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error || 'Unable to load e-way bill status.');
        if (!controller.signal.aborted) { setSubmission(body.submission); setEnvironment(body.environment); setLoaded(true); }
      }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [invoiceNo]);
  async function saveTransport() {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage('Saving transport details…');
    try {
      const response = await fetch('/api/whitebooks/ewaybill', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceNo, transport }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || 'Unable to save transport details.');
      setMessage('Transport details saved for this invoice.');
    } catch (error) { setMessage(error.message); }
    finally { busy.current = false; setPending(false); }
  }
  async function generate() {
    if (busy.current) return;
    if (environment === 'production' && !window.confirm(`Generate a production e-way bill for ${invoiceNo}?`)) return;
    busy.current = true; setPending(true); setMessage(`Generating ${environment} e-way bill…`);
    try {
      const response = await fetch('/api/whitebooks/ewaybill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceNo, transport, draft }) });
      const body = await response.json();
      if (body.validation) onValidation?.(body.validation);
      if (!response.ok || !body.ok) throw new Error(body.error || 'E-way bill generation failed.');
      if (body.requiresConfirmation) { setFoundBill(body.result); setMessage('An e-way bill already exists. Review it below before saving.'); return; }
      setSubmission({ state: body.state, result: body.result });
      setMessage(body.warning || `${environment} e-way bill generated and saved.`);
    } catch (error) { setMessage(error.message); }
    finally { busy.current = false; setPending(false); }
  }
  async function checkStatus(saveExisting = false) {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage('Checking WhiteBooks for an existing e-way bill…');
    try {
      const response = await fetch('/api/whitebooks/ewaybill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceNo, action: saveExisting ? 'save-existing' : 'reconcile', ...(saveExisting ? { confirmedEwbNo: String(foundBill.EwbNo) } : {}) }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || 'Status lookup failed.');
      if (body.requiresConfirmation) { setFoundBill(body.result); setMessage('An e-way bill already exists. Review it below before saving.'); return; }
      if (body.state === 'not_found') { setFoundBill(null); setMessage('WhiteBooks reports no e-way bill linked to this IRN. No changes were saved.'); return; }
      setFoundBill(null);
      setSubmission({ state: body.state, result: body.result });
      setMessage(saveExisting ? 'Existing e-way bill saved for this invoice. No new bill was generated.' : 'E-way bill details are already saved for this invoice.');
    } catch (error) { setMessage(error.message); }
    finally { busy.current = false; setPending(false); }
  }
  async function downloadPdf() {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage('Preparing e-way bill PDF…');
    try {
      const response = await fetch(`/api/whitebooks/ewaybill/pdf?invoiceNo=${encodeURIComponent(invoiceNo)}&environment=${encodeURIComponent(environment)}`, { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Unable to download e-way bill PDF.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url;
      link.download = `${environment}-EwayBill-${submission.result.EwbNo}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('E-way bill PDF downloaded from saved records.');
    } catch (error) { setMessage(error.message); }
    finally { busy.current = false; setPending(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(submission.result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `${environment}-ewaybill-${invoiceNo.replace(/[^a-z0-9_-]/gi, '_')}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="einvoice-section ewaybill-actions" aria-label="WhiteBooks e-way bill">
    <header><div><h3>WhiteBooks {environment} e-way bill</h3><p>Production generation uses the saved IRN and e-invoice authentication. Save transport details before leaving this invoice.</p></div></header>
    <div className="einvoice-section-body">
      <div className="einvoice-actionbar">
        <button type="button" className="ewaybill-button ewaybill-button-save" disabled={pending} onClick={saveTransport}>Save transport details</button>
        <button type="button" className="ewaybill-button ewaybill-button-primary" disabled={!loaded || pending || Boolean(submission) || Boolean(foundBill)} onClick={generate}>{pending ? 'Please wait…' : `Generate ${environment} e-way bill`}</button>
        {environment === 'production' ? <button type="button" className="ewaybill-button ewaybill-button-secondary" disabled={!loaded || pending} onClick={() => checkStatus(false)}>Check E-Way Bill Status</button> : null}
      </div>
      {foundBill ? <div role="region" aria-label="Existing e-way bill confirmation">
        <p><strong>An e-way bill already exists for this invoice’s IRN.</strong></p>
        <p>E-way bill: {foundBill.EwbNo}</p>
        <p>Generated: {foundBill.EwbDt} · Valid until: {foundBill.EwbValidTill}</p>
        <p>Do you want to update the e-way bill details in the database for invoice {invoiceNo}?</p>
        <div className="einvoice-actionbar">
          <button type="button" className="einvoice-download" disabled={pending} onClick={() => checkStatus(true)}>Yes, save to invoice</button>
          <button type="button" disabled={pending} onClick={() => { setFoundBill(null); setMessage('Existing bill was not saved. No new e-way bill was generated.'); }}>No, do not save</button>
        </div>
      </div> : null}
      {submission?.result ? <><p>E-way bill: {submission.result.EwbNo}</p><p>Generated: {submission.result.EwbDt} · Valid until: {submission.result.EwbValidTill}</p></> : null}
      <div className="ewaybill-downloads">
      {submission?.result ? <button type="button" className="ewaybill-button ewaybill-button-secondary" onClick={download}>Download e-way bill result</button> : null}
      {loaded && submission?.state === 'succeeded' && /^\d{12}$/.test(String(submission?.result?.EwbNo)) ? <button type="button" className="ewaybill-button ewaybill-button-pdf" disabled={pending} onClick={downloadPdf}>Download e-way bill PDF</button> : null}
      </div>
      {submission && submission.state !== 'succeeded' ? <p>Previous submission pending or uncertain. Check WhiteBooks before resubmitting.</p> : null}
      <p role="status" aria-live="polite">{message}</p>
    </div>
  </section>;
}

