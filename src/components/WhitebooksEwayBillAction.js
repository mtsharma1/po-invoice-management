"use client";

import { useEffect, useRef, useState } from 'react';

export default function WhitebooksEwayBillAction({ invoiceNo, transport, draft, onValidation }) {
  const [submission, setSubmission] = useState(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  const [environment, setEnvironment] = useState('sandbox');
  useEffect(() => {
    const controller = new AbortController();
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
      setSubmission({ state: body.state, result: body.result });
      setMessage(body.warning || `${environment} e-way bill generated and saved.`);
    } catch (error) { setMessage(error.message); }
    finally { busy.current = false; setPending(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(submission.result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `${environment}-ewaybill-${invoiceNo.replace(/[^a-z0-9_-]/gi, '_')}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="einvoice-section" aria-label="WhiteBooks e-way bill">
    <header><div><h3>WhiteBooks {environment} e-way bill</h3><p>Production generation uses the saved IRN and e-invoice authentication. Save transport details before leaving this invoice.</p></div></header>
    <div className="einvoice-section-body">
      <div className="einvoice-actionbar">
        <button type="button" className="einvoice-download" disabled={pending} onClick={saveTransport}>Save transport details</button>
        <button type="button" className="einvoice-download" disabled={!loaded || pending || Boolean(submission)} onClick={generate}>{pending ? 'Please wait…' : `Generate ${environment} e-way bill`}</button>
      </div>
      {submission?.result ? <><p>E-way bill: {submission.result.EwbNo}</p><p>Generated: {submission.result.EwbDt} · Valid until: {submission.result.EwbValidTill}</p><button type="button" onClick={download}>Download e-way bill result</button></> : null}
      {submission && submission.state !== 'succeeded' ? <p>Previous submission pending or uncertain. Check WhiteBooks before resubmitting.</p> : null}
      <p role="status" aria-live="polite">{message}</p>
    </div>
  </section>;
}
