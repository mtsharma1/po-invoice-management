'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import ActionIcon from './ActionIcon';

export default function SettingsWorkbench({ data }) {
  const router = useRouter();
  const [editor, setEditor] = useState(null);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function addUser() {
    setMessage('');
    setEditor({ id: 0, userId: '', password: '', access: String(data.accessTypes[0]?.AccessType ?? '') });
  }

  function editUser(user) {
    setMessage('');
    setEditor({ id: user.ID, userId: user.UserID || '', password: '', access: String(user.Access ?? '') });
  }

  function update(field, value) {
    setEditor((current) => ({ ...current, [field]: value }));
  }

  function saveUser() {
    if (!editor) return;
    startTransition(async () => {
      try {
        setMessage('Saving user...');
        const response = await fetch('/api/settings/users/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editor),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'User save failed.');
        setMessage(result.message || 'User saved successfully.');
        setEditor(null);
        router.refresh();
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  function deleteUser(user) {
    if (!window.confirm(`Delete user "${user.UserID}"? This action cannot be undone.`)) return;
    startTransition(async () => {
      try {
        setMessage('Deleting user...');
        const response = await fetch('/api/settings/users/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: user.ID }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'User delete failed.');
        setMessage(result.message || 'User deleted successfully.');
        if (editor?.id === user.ID) setEditor(null);
        router.refresh();
      } catch (error) {
        setMessage(error.message);
      }
    });
  }

  return (
    <section className="settings-user-workspace">
      <div className="settings-user-heading">
        <div>
          <p>Access settings workflow</p>
          <h2>MANAGE DATABASE USERS</h2>
          <span>Add, edit or remove application users and assign their Access role.</span>
        </div>
        <div className="settings-heading-actions">
          <button className="settings-add-user" type="button" onClick={addUser}><ActionIcon name="plus" /> Add user</button>
          <Link className="settings-close" href="/dashboard"><ActionIcon name="clear" /> Close</Link>
        </div>
      </div>

      {editor ? (
        <div className="settings-user-editor">
          <div className="settings-editor-heading">
            <div><p>{editor.id ? 'Edit user' : 'New user'}</p><h3>{editor.id ? editor.userId : 'Add database user'}</h3></div>
            <button type="button" onClick={() => setEditor(null)} aria-label="Close user editor"><ActionIcon name="clear" /></button>
          </div>
          <div className="settings-editor-fields">
            <label><span>User name</span><input value={editor.userId} onChange={(event) => update('userId', event.target.value)} autoFocus /></label>
            <label>
              <span>Password {editor.id ? '(leave blank to keep current)' : ''}</span>
              <input type="password" value={editor.password} onChange={(event) => update('password', event.target.value)} />
            </label>
            <label>
              <span>Access</span>
              <select value={editor.access} onChange={(event) => update('access', event.target.value)}>
                {data.accessTypes.map((access) => (
                  <option key={access.AccessType} value={access.AccessType}>{access.AccessDescription}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="settings-editor-actions">
            <button className="settings-save-user" type="button" onClick={saveUser} disabled={isPending}><ActionIcon name="save" /> {isPending ? 'Saving…' : 'Save'}</button>
            <button className="settings-cancel-user" type="button" onClick={() => setEditor(null)} disabled={isPending}>Cancel</button>
          </div>
        </div>
      ) : null}

      {message ? <div className="dispatch-message settings-message"><span aria-hidden="true">i</span>{message}</div> : null}

      <div className="settings-users-panel">
        <div className="settings-users-panel-heading">
          <div><p>User record source</p><h3>Application users</h3></div>
          <span>{data.users.length} user{data.users.length === 1 ? '' : 's'}</span>
        </div>
        <div className="settings-users-table-wrap">
          <table className="settings-users-table">
            <thead><tr><th>ID</th><th>User ID</th><th>Password</th><th>Access</th><th>Status</th><th>Last password change</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.ID}>
                  <td>{user.ID}</td>
                  <td><button className="settings-user-link" type="button" onClick={() => editUser(user)}>{user.UserID}</button></td>
                  <td><span className="settings-password-mask">••••••••</span></td>
                  <td>{user.AccessDescription}</td>
                  <td><span className={`settings-user-status ${user.isActive ? 'active' : 'inactive'}`}>{user.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td>{dateTimeText(user.PwdLastChanged)}</td>
                  <td className="settings-row-actions">
                    <button type="button" onClick={() => editUser(user)}>Edit</button>
                    <button className="delete" type="button" onClick={() => deleteUser(user)} disabled={isPending}>Delete</button>
                  </td>
                </tr>
              ))}
              {!data.users.length ? <tr><td colSpan="7">No users found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function dateTimeText(value) {
  if (!value) return '—';
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
