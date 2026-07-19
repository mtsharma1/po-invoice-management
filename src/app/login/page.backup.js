import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth';

export default async function LoginPage({ searchParams }) {
  const session = await getCurrentSession();
  if (session) redirect('/dashboard');

  const params = await searchParams;
  const error = params?.error || '';
  const next = typeof params?.next === 'string' && params.next.startsWith('/')
    ? params.next
    : '/dashboard';

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-brand-panel">
          <div className="login-brand-lockup">
            <span className="login-brand-mark">TW</span>
            <span>
              <strong>TEAKWOOD</strong>
              <small>Operations Suite</small>
            </span>
          </div>

          <div className="login-brand-copy">
            <p className="login-overline">PO &amp; Invoice Management</p>
            <h1>Every order.<br />One clear view.</h1>
            <p>Manage purchase orders, stock, dispatch and customer invoices from one secure workspace.</p>
          </div>

          <div className="login-capabilities" aria-label="Application modules">
            <div><span>01</span><strong>Purchase Orders</strong><small>Import and track</small></div>
            <div><span>02</span><strong>Dispatch</strong><small>Prepare and post</small></div>
            <div><span>03</span><strong>Invoices</strong><small>Create and report</small></div>
          </div>

          <p className="login-brand-footer"><span /> Secure business workspace</p>
        </section>

        <section className="login-form-panel">
          <div className="login-form-wrap">
            <p className="login-form-kicker">Secure sign in</p>
            <h2>Welcome back</h2>
            <p className="login-help">Enter the same credentials you use in the Access application.</p>

            {error ? <p className="login-error" role="alert">{error}</p> : null}

            <form className="login-form" action="/api/auth/login" method="post">
              <input type="hidden" name="next" value={next} />
              <label>
                <span>User ID</span>
                <span className="login-input-shell">
                  <UserIcon />
                  <input name="userId" autoComplete="username" placeholder="Enter your user ID" required autoFocus />
                </span>
              </label>
              <label>
                <span>Password</span>
                <span className="login-input-shell">
                  <LockIcon />
                  <input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required />
                </span>
              </label>
              <button className="login-submit" type="submit">
                <span>Open dashboard</span>
                <span aria-hidden="true">→</span>
              </button>
            </form>

            <p className="login-security-note"><span aria-hidden="true">◆</span> Protected access for authorized users only</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M4.5 20c.8-3.4 3.3-5.2 7.5-5.2s6.7 1.8 7.5 5.2" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </svg>
  );
}
