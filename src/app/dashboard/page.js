import AppShell from '@/components/AppShell';
import { DataError } from '@/components/DataState';
import PageHeader from '@/components/PageHeader';
import { getDashboardStats } from '@/lib/dashboard';
import { dateText, qty } from '@/lib/format';
import { safeData } from '@/lib/safeData';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { data, error } = await safeData(getDashboardStats, {
    purchaseOrders: {},
    sku: {},
    dispatch: {},
    invoices: {},
  });

  return (
    <AppShell>
      <PageHeader eyebrow="Operations" title="PO & Invoice Command Centre" />
      <DataError error={error} />
      <section className="card-grid">
        <StatCard label="Purchase Orders" value={qty(data.purchaseOrders.totalPOs)} sub={dateText(data.purchaseOrders.lastPODate)} />
        <StatCard label="SKU Lines" value={qty(data.sku.totalSKUs)} sub={`${qty(data.sku.totalPOQty)} total qty`} />
        <StatCard label="Dispatch Rows" value={qty(data.dispatch.dispatchRows)} sub={`${qty(data.dispatch.dispatchedQty)} dispatched`} />
        <StatCard label="Invoices" value={qty(data.invoices.invoices)} sub={dateText(data.invoices.lastInvoiceDate)} />
      </section>
    </AppShell>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value || 0}</strong>
      <small>{sub || 'No date'}</small>
    </article>
  );
}
