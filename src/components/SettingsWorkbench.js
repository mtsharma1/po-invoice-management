'use client';

import { useState, useTransition } from 'react';

export default function SettingsWorkbench({ data }) {
  const [settings, setSettings] = useState(data.settings);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function update(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function saveSettings() {
    startTransition(async () => {
      try {
        setMessage('Saving settings...');
        const response = await fetch('/api/settings/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Settings save failed.');
        setMessage(result.message || 'Settings saved.');
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  return (
    <section className="access-form-shell settings-shell">
      <div className="access-title">SETTINGS</div>
      <div className="settings-grid">
        <div className="settings-panel">
          <h2>Bank Details</h2>
          <SettingsInput label="Account No." value={settings.accountNo} onChange={(value) => update('accountNo', value)} />
          <SettingsInput label="Bank Name" value={settings.bankName} onChange={(value) => update('bankName', value)} />
          <SettingsInput label="Branch" value={settings.branchName} onChange={(value) => update('branchName', value)} />
          <SettingsInput label="IFSC Code" value={settings.ifscCode} onChange={(value) => update('ifscCode', value)} />
          <SettingsInput label="Bill From Name" value={settings.billFromName} onChange={(value) => update('billFromName', value)} />
          <SettingsInput label="Dispatch From Name" value={settings.dispatchFromName} onChange={(value) => update('dispatchFromName', value)} />
          <button type="button" onClick={saveSettings} disabled={isPending}>SAVE SETTINGS</button>
          {message ? <div className="dispatch-message">{message}</div> : null}
        </div>

        <div className="settings-panel">
          <h2>Templates</h2>
          <table className="mini-list-table">
            <thead><tr><th>ID</th><th>Template Name</th><th>Excel Template</th></tr></thead>
            <tbody>
              {data.templates.map((template) => (
                <tr key={template.id}>
                  <td>{template.id}</td>
                  <td>{template.templateName}</td>
                  <td>{template.excelTemplate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="settings-panel">
          <h2>Database Server</h2>
          <SettingsReadOnly label="Server" value={data.server.host} />
          <SettingsReadOnly label="Database" value={data.server.database} />
          <SettingsReadOnly label="User" value={data.server.user} />
          <SettingsReadOnly label="Port" value={data.server.port} />
          <p className="settings-note">The web app reads live database connection values from the environment file, matching the Access `tblServer` concept without exposing the password on screen.</p>
        </div>
      </div>
    </section>
  );
}

function SettingsInput({ label, value, onChange }) {
  return (
    <label className="access-field">
      <span>{label}</span>
      <input value={value || ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SettingsReadOnly({ label, value }) {
  return (
    <label className="access-field">
      <span>{label}</span>
      <input value={value || ''} readOnly />
    </label>
  );
}
