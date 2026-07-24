import AppShell from '@/components/AppShell';
import { DataError } from '@/components/DataState';
import PageHeader from '@/components/PageHeader';
import { getDashboardStats } from '@/lib/dashboard';
import { qty } from '@/lib/format';
import { safeData } from '@/lib/safeData';

export const dynamic = 'force-dynamic';

const emptyCategory = {
  pendingOrders: 0,
  dispatchedLastMonth: 0,
  dispatchAverageLastMonth: 0,
  daysOrderInHand: 0,
};

export default async function DashboardPage() {
  const { data, error } = await safeData(getDashboardStats, {
    periodLabel: '',
    suitcase: emptyCategory,
    backpack: emptyCategory,
  });

  return (
    <AppShell>
      <PageHeader eyebrow="OPERATIONS" title="DASHBOARD" />
      <DataError error={error} />
      <section className="operations-dashboard">
        <DashboardCategory title="SuitCase" data={data.suitcase} period={data.periodLabel} accent="blue" />
        <DashboardCategory title="BackPack" data={data.backpack} period={data.periodLabel} accent="green" />
      </section>
    </AppShell>
  );
}

function DashboardCategory({ title, data, period, accent }) {
  const daysTone = daysOrderTone(data.daysOrderInHand);

  return (
    <article className={`dashboard-category ${accent}`}>
      <header>
        <div><p>Product category</p><h2>{title}</h2></div>
        <span>{period || 'Current month'}</span>
      </header>
      <div className="dashboard-metric-grid">
        <Metric label="Total pending orders" value={qty(data.pendingOrders)} note="Pending quantity" tone="pending" />
        <Metric label="Dispatch average last month" value={numberText(data.dispatchAverageLastMonth)} note={`${qty(data.dispatchedLastMonth)} dispatched in ${period || 'current month'}`} tone="average" />
        <Metric
          label="Days order in hand"
          value={qty(data.daysOrderInHand)}
          note="At 1,000 units per day"
          tone={`days days-${daysTone}`}
        />
      </div>
    </article>
  );
}

function Metric({ label, value, note, tone }) {
  return (
    <div className={`dashboard-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function numberText(value) {
  return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function daysOrderTone(value) {
  const days = Number(value || 0);
  if (days < 15) return 'critical';
  if (days <= 20) return 'warning';
  return 'healthy';
}
