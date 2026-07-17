'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/purchase-orders', label: 'Purchase Orders', icon: 'orders' },
  { href: '/shell-orders', label: 'Shell Orders', icon: 'package' },
  { href: '/dispatch', label: 'Dispatch', icon: 'dispatch' },
  { href: '/customer-invoice', label: 'Customer Invoice', icon: 'invoice' },
  { href: '/invoices', label: 'Invoice Reports', icon: 'reports' },
  { href: '/import', label: 'Import PO', icon: 'import' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

export default function AppNavigation({ isAdmin = false }) {
  const pathname = usePathname();
  const visibleItems = isAdmin ? navItems : navItems.filter((item) => item.href !== '/settings');

  return (
    <nav className="nav-list" aria-label="Main navigation">
      {visibleItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link className={active ? 'active' : ''} href={item.href} key={item.href}>
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function NavIcon({ name }) {
  const paths = {
    dashboard: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
    orders: ['M7 4h10v3H7z', 'M5 6h14v15H5z', 'M8 11h8', 'M8 15h8'],
    dispatch: ['M3 6h11v10H3z', 'M14 10h4l3 3v3h-7z', 'M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
    package: ['M4 7l8-4 8 4-8 4z', 'M4 7v10l8 4 8-4V7', 'M12 11v10'],
    invoice: ['M6 3h9l3 3v15H6z', 'M15 3v4h4', 'M9 12h6', 'M9 16h4'],
    reports: ['M5 3h14v18H5z', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
    import: ['M12 3v12', 'M8 11l4 4 4-4', 'M5 19h14'],
    settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M19 13.5l2-1.5-2-1.5-.5-1.3.4-2.5-2.5-.6-1.1-.8L14 3h-4L9.2 5.3l-1.1.8-2.5.6.4 2.5-.5 1.3L3 12l2.5 1.5.5 1.3-.4 2.5 2.5.6 1.1.8L10 21h4l.8-2.3 1.1-.8 2.5-.6-.4-2.5z'],
  };

  return (
    <svg className="nav-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      {paths[name].map((path, index) => <path d={path} key={index} />)}
    </svg>
  );
}
