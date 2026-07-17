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
    <section className="access-form-shell settings-shell settings-access-form">
      <div className="settings-access-heading">
        <div>
          <p>Application setup</p>
          <h2>Access settings</h2>
          <span>Web equivalents of the Access sysConfig, tblTemplates and tblServer sections.</span>
        </div>
        <button type="button" onClick={saveSettings} disabled={isPending}>{isPending ? 'Saving…' : 'Save settings'}</button>
      </div>

      <div className="settings-grid">
        <div className="settings-panel settings-defaults-panel">
          <SectionHeading number="01" title="Invoice & bank defaults" source="sysConfig" />
          <div className="settings-fields-grid">
          <SettingsInput label="Account No." value={settings.accountNo} onChange={(value) => update('accountNo', value)} />
          <SettingsInput label="Bank Name" value={settings.bankName} onChange={(value) => update('bankName', value)} />
          <SettingsInput label="Branch" value={settings.branchName} onChange={(value) => update('branchName', value)} />
          <SettingsInput label="IFSC Code" value={settings.ifscCode} onChange={(value) => update('ifscCode', value)} />
          <SettingsInput label="Bill From Name" value={settings.billFromName} onChange={(value) => update('billFromName', value)} />
          <SettingsInput label="Dispatch From Name" value={settings.dispatchFromName} onChange={(value) => update('dispatchFromName', value)} />
          </div>
        </div>

        <div className="settings-panel">
          <SectionHeading number="02" title="Excel templates" source="tblTemplates" />
          <table className="mini-list-table">
            <thead><tr><th>ID</th><th>Template name</th><th>Excel template</th></tr></thead>
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
          <SectionHeading number="03" title="Database server" source="tblServer" />
          <SettingsReadOnly label="Server" value={data.server.host} />
          <SettingsReadOnly label="Database" value={data.server.database} />
          <SettingsReadOnly label="User" value={data.server.user} />
          <SettingsReadOnly label="Port" value={data.server.port} />
          <p className="settings-note">Connection values are read-only in the web app. The password remains hidden and is never returned to this screen.</p>
        </div>
      </div>
      {message ? <div className="dispatch-message settings-message">{message}</div> : null}
    </section>
  );
}

function SectionHeading({ number, title, source }) {
  return (
    <div className="settings-section-heading">
      <span>{number}</span>
      <div><h3>{title}</h3><p>Access source: {source}</p></div>
    </div>
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
