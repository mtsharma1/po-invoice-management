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
    <main className="simple-login-page">
      <section className="simple-login-card">
        <header className="simple-login-header">
          <div className="simple-login-brand">
            <span className="simple-login-mark">TW</span>
            <span>
              <strong>Teakwood<span>Leathers</span></strong>
              <small>PO &amp; Invoice Management</small>
            </span>
          </div>
          <h1>Welcome back</h1>
          <p>Sign in to continue to your workspace.</p>
        </header>

        {error ? <p className="simple-login-error" role="alert">{error}</p> : null}

        <form className="simple-login-form" action="/api/auth/login" method="post">
          <input type="hidden" name="next" value={next} />
          <label>
            <span>User ID</span>
            <span className="simple-login-input">
              <UserIcon />
              <input name="userId" autoComplete="username" placeholder="Enter your user ID" required autoFocus />
            </span>
          </label>
          <label>
            <span>Password</span>
            <span className="simple-login-input">
              <LockIcon />
              <input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required />
            </span>
          </label>
          <button className="simple-login-submit" type="submit">Sign in</button>
        </form>

        <p className="simple-login-note">Authorized users only</p>
      </section>
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
