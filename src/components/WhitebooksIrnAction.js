'use client';

import { useEffect, useRef, useState } from 'react';

export default function WhitebooksIrnAction({ draft, validation, disabled, onValidation, onGenerated }) {
  const [pending, setPending] = useState(true);
  const [submission, setSubmission] = useState(null);
  const [message, setMessage] = useState('');
  const [statusLoaded, setStatusLoaded] = useState(false);
  const busy = useRef(false);
  const [environment, setEnvironment] = useState('sandbox');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/whitebooks/irn?invoiceNo=${encodeURIComponent(draft.invoiceNo)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error || 'Could not load IRN status.');
        setEnvironment(body.environment);
        setSubmission(body.submission);
        setStatusLoaded(true);
      })
      .catch((error) => { if (!controller.signal.aborted) setMessage(error.message); })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [draft.invoiceNo]);

  async function generate() {
    if (busy.current) return;
    if (environment === 'production' && !submission?.result && !window.confirm(`Generate a production IRN for ${draft.invoiceNo}? This submits the invoice to WhiteBooks/IRP.`)) return;
    busy.current = true;
    setPending(true);
    setMessage(`Processing ${environment} IRN…`);
    try {
      const response = await fetch('/api/whitebooks/irn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceNo: draft.invoiceNo, draft }),
      });
      const body = await response.json();
      if (body.validation) onValidation(body.validation);
      if (!response.ok || !body.ok) throw new Error(body.error || 'IRN generation failed.');
      setSubmission({ state: body.state, result: body.result });
      setMessage(body.warning || `${environment} IRN generated and saved.`);
      if (environment === 'production' && body.state === 'succeeded') onGenerated?.(body.result);
    } catch (error) {
      setMessage(`${error.message} Refresh the page to check submission status.`);
      setStatusLoaded(false);
    } finally {
      setPending(false);
      busy.current = false;
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(submission.result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `WhiteBooks-${environment}-${draft.invoiceNo.replace(/[^a-z0-9_-]/gi, '_')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="einvoice-section" aria-label="WhiteBooks IRN">
      <header><div><h3>WhiteBooks {environment} IRN</h3><p>{environment === 'production' ? 'Production results are saved to the selected invoice. Included transport details request an e-way bill with the IRN.' : 'Test results are stored separately from production invoice IRNs.'}</p></div></header>
      <div className="einvoice-section-body">
        <button className="einvoice-download" type="button" onClick={generate}
          disabled={pending || disabled || !statusLoaded || (Boolean(submission) && submission.state !== 'generated') || (!submission?.result && (Boolean(draft.irn) || !validation?.valid || validation?.stale))}>
          {pending ? 'Working…' : submission?.state === 'generated' ? 'Save generated IRN' : `Generate ${environment} IRN`}
        </button>
        {!validation?.valid || validation?.stale ? <p>Validate the current invoice before generating.</p> : null}
        {submission?.result ? <>
          <p style={{ overflowWrap: 'anywhere' }}>IRN: {submission.result.Irn}</p>
          <p>Acknowledgement: {submission.result.AckNo} · {submission.result.AckDt}</p>
          {submission.result.EwbNo ? <p>E-way bill: {submission.result.EwbNo} · Valid until: {submission.result.EwbValidTill}</p> : null}
          <button type="button" onClick={download}>Download result</button>
        </> : null}
        {submission && submission.state !== 'succeeded' ? <p>Submission pending or uncertain. Check WhiteBooks by document details before resubmitting.</p> : null}
        <p role="status" aria-live="polite">{message}</p>
      </div>
    </section>
  );
}
