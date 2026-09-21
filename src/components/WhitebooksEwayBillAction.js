"use client";

import { useEffect, useRef, useState } from 'react';

export default function WhitebooksEwayBillAction({ invoiceNo, transport, draft, onValidation }) {
  const [submission, setSubmission] = useState(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/whitebooks/ewaybill?invoiceNo=${encodeURIComponent(invoiceNo)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error || 'Unable to load e-way bill status.');
        if (!controller.signal.aborted) { setSubmission(body.submission); setLoaded(true); }
      }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [invoiceNo]);
  async function generate() {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage('Generating sandbox e-way bill…');
    try {
      const response = await fetch('/api/whitebooks/ewaybill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceNo, transport, draft, onValidation }) });
      const body = await response.json();
      if (body.validation) onValidation?.(body.validation);
      if (!response.ok || !body.ok) throw new Error(body.error || 'E-way bill generation failed.');
      setSubmission({ state: body.state, result: body.result });
      setMessage(body.warning || 'Sandbox e-way bill generated and saved.');
    } catch (error) { setMessage(error.message); }
    finally { busy.current = false; setPending(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(submission.result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `sandbox-ewaybill-${invoiceNo.replace(/[^a-z0-9_-]/gi, '_')}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="einvoice-section" aria-label="WhiteBooks sandbox e-way bill">
    <header><div><h3>WhiteBooks sandbox e-way bill</h3><p>Generate from the invoice and transport details using standalone e-way bill authentication.</p></div></header>
    <div className="einvoice-section-body">
      <div className="einvoice-actionbar"><button type="button" className="einvoice-download" disabled={!loaded || pending || Boolean(submission)} onClick={generate}>{pending ? 'Generating…' : 'Generate sandbox e-way bill'}</button></div>
      {submission?.result ? <><p>E-way bill: {submission.result.EwbNo}</p><p>Generated: {submission.result.EwbDt} · Valid until: {submission.result.EwbValidTill}</p><button type="button" onClick={download}>Download sandbox e-way bill result</button></> : null}
      {submission && submission.state !== 'succeeded' ? <p>Previous submission pending or uncertain. Check WhiteBooks before resubmitting.</p> : null}
      <p role="status" aria-live="polite">{message}</p>
    </div>
  </section>;
}
