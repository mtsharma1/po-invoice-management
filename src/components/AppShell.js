import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth';

const nav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/purchase-orders', label: 'Purchase Orders' },
  { href: '/dispatch', label: 'Dispatch' },
  { href: '/shell-orders', label: 'Shell Orders' },
  { href: '/customer-invoice', label: 'Customer Invoice' },
  { href: '/invoices', label: 'Invoice Reports' },
  { href: '/import', label: 'Import' },
  { href: '/settings', label: 'Settings' },
];

export default async function AppShell({ children }) {
  const session = await getCurrentSession();
  if (!session) redirect('/login');

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">TW</span>
          <span>
            <strong>Teakwood</strong>
            <small>PO & Invoice</small>
          </span>
        </Link>
        <nav className="nav-list">
          {nav.map((item) => (
            <Link href={item.href} key={item.href}>{item.label}</Link>
          ))}
        </nav>
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
