import Link from 'next/link';

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

export default function AppShell({ children }) {
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
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}
