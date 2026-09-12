'use client';

import { useState } from 'react';

export default function WhitebooksSettings({ configured = false }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);

  async function testAuthentication() {
    setPending(true);
    setResult(null);
    try {
      const response = await fetch('/api/whitebooks/authenticate', { method: 'POST' });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || 'Authentication failed.');
      setResult({ ok: true, message: body.message });
    } catch (error) {
      setResult({ ok: false, message: error.message || 'Unable to test authentication.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="WhiteBooks integration">
      <div className="settings-dropbox-panel">
        <div className="settings-dropbox-copy">
          <div>
            <p>E-invoice sandbox</p>
            <h3>WhiteBooks authentication</h3>
            <span>Verify your sandbox credentials before using the e-invoice API.</span>
            {!configured ? <small>Add the WhiteBooks credentials to the server environment and restart the app.</small> : null}
          </div>
        </div>
        <div className="settings-dropbox-actions">
          <span className="settings-dropbox-status">{configured ? 'Configured' : 'Setup required'}</span>
          <button className="settings-dropbox-connect" type="button" disabled={!configured || pending} onClick={testAuthentication}>
            {pending ? 'Authenticating…' : 'Test authentication'}
          </button>
        </div>
      </div>
      <div role="status" aria-live="polite">
        {result ? <div className={`settings-dropbox-feedback ${result.ok ? 'success' : 'error'}`}>{result.message}</div> : null}
      </div>
    </section>
  );
}
