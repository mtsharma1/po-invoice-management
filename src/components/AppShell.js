import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth';
import AppNavigation from './AppNavigation';

export default async function AppShell({ children }) {
  const session = await getCurrentSession();
  if (!session) redirect('/login');

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <span className="sidebar-menu-glyph" aria-hidden="true">☰</span>
          <span>
            <strong>Procure<span>Desk</span></strong>
            <small>PO &amp; Invoice Management</small>
          </span>
        </Link>
        <AppNavigation />
        <div className="sidebar-session">
          <small>Signed in as</small>
          <strong>{session?.userId || 'User'}</strong>
          <span>{session?.role || 'User'}</span>
          <form action="/api/auth/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}
