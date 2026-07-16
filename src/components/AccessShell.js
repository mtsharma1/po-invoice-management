import Link from 'next/link';

const nav = [
  { href: '/dashboard', label: 'DASHBOARD' },
  { href: '/purchase-orders', label: 'MASTER' },
  { href: '/shell-orders', label: 'SHELL ORDERS' },
  { href: '/dispatch', label: 'DISPATCH' },
  { href: '/customer-invoice', label: 'CUSTOMER INVOICE' },
  { href: '/import', label: 'IMPORT' },
  { href: '/settings', label: 'SETTINGS' },
  { href: '/login', label: 'QUIT' },
];

export default function AccessShell({ active, children }) {
  return (
    <div className="access-app">
      <header className="access-topbar">
        <strong>PO AND INVOICE MANAGEMENT</strong>
        <span><b>USER :</b> Mithlesh</span>
      </header>
      <div className="access-body">
        <aside className="access-side-menu">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.label === active ? 'active' : ''}
            >
              {item.label}
            </Link>
          ))}
        </aside>
        <main className="access-content">{children}</main>
      </div>
    </div>
  );
}
