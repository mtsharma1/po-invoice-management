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
      <section className="login-card">
        <p className="eyebrow">Secure Access</p>
        <h1>Sign in</h1>
        <p className="login-help">Use the same user ID and password as the Access application.</p>
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        <form className="form-stack" action="/api/auth/login" method="post">
          <input type="hidden" name="next" value={next} />
          <label>
            User ID
            <input name="userId" autoComplete="username" required autoFocus />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="btn" type="submit">Open Dashboard</button>
        </form>
      </section>
    </main>
  );
}
