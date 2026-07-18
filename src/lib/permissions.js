export const FEATURES = Object.freeze({
  DASHBOARD: 'dashboard',
  PURCHASE_ORDERS: 'purchase-orders',
  SHELL_ORDERS: 'shell-orders',
  DISPATCH: 'dispatch',
  CUSTOMER_INVOICE: 'customer-invoice',
  INVOICE_REPORTS: 'invoice-reports',
  IMPORT_PO: 'import-po',
  SETTINGS: 'settings',
});

const accessFeatures = Object.freeze({
  1: [FEATURES.DASHBOARD],
  5: Object.values(FEATURES),
  6: [FEATURES.DASHBOARD, FEATURES.PURCHASE_ORDERS, FEATURES.DISPATCH, FEATURES.IMPORT_PO],
  7: [FEATURES.DASHBOARD, FEATURES.SHELL_ORDERS],
  8: [FEATURES.DASHBOARD, FEATURES.CUSTOMER_INVOICE, FEATURES.INVOICE_REPORTS],
});

const pathFeatures = [
  ['/api/settings', FEATURES.SETTINGS],
  ['/api/customer-invoice', FEATURES.CUSTOMER_INVOICE],
  ['/api/shell-orders', FEATURES.SHELL_ORDERS],
  ['/api/dispatch', FEATURES.DISPATCH],
  ['/api/invoices', FEATURES.INVOICE_REPORTS],
  ['/api/import', FEATURES.IMPORT_PO],
  ['/purchase-orders', FEATURES.PURCHASE_ORDERS],
  ['/customer-invoice', FEATURES.CUSTOMER_INVOICE],
  ['/shell-orders', FEATURES.SHELL_ORDERS],
  ['/dashboard', FEATURES.DASHBOARD],
  ['/dispatch', FEATURES.DISPATCH],
  ['/invoices', FEATURES.INVOICE_REPORTS],
  ['/settings', FEATURES.SETTINGS],
  ['/import', FEATURES.IMPORT_PO],
];

export function canAccessFeature(session, feature) {
  if (!session) return false;
  if (session.admin || Number(session.access) === 5) return true;
  return (accessFeatures[Number(session.access)] || [FEATURES.DASHBOARD]).includes(feature);
}

export function featureForPath(pathname) {
  const cleanPath = String(pathname || '/').split('?')[0];
  return pathFeatures.find(([prefix]) => cleanPath === prefix || cleanPath.startsWith(`${prefix}/`))?.[1] || null;
}

export function canAccessPath(session, pathname) {
  if (!session) return false;
  const cleanPath = String(pathname || '/').split('?')[0];
  if (cleanPath === '/' || cleanPath === '/dashboard') return true;
  const feature = featureForPath(cleanPath);
  return feature ? canAccessFeature(session, feature) : false;
}
