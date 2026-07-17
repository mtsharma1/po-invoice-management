import { query } from './db';

function accessDashboardMonth(reference = new Date()) {
  const currentMonthStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const nextMonthStart = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  const daysInCurrentMonth = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
  const sqlDate = (value) => [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');

  return {
    from: sqlDate(currentMonthStart),
    to: sqlDate(nextMonthStart),
    days: daysInCurrentMonth,
    label: currentMonthStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
  };
}

export async function getDashboardStats() {
  const period = accessDashboardMonth();
  const [pendingRows, dispatchRows] = await Promise.all([
    query(
      `SELECT Category, COALESCE(SUM(PendingQty), 0) AS PendingQty
       FROM (
         SELECT
           CASE WHEN LEFT(COALESCE(p.VendorArticleName, ''), 4) = 'T_TR'
                THEN 'SuitCase' ELSE 'BackPack' END AS Category,
           COALESCE(p.Quantity, 0) - COALESCE(d.DispatchQty, 0) AS PendingQty
         FROM vwPoDetails p
         LEFT JOIN vwDispatchDetails d ON d.POID = p.POID
         GROUP BY p.POBarcode, p.VendorArticleName, p.Quantity, d.DispatchQty,
           CASE WHEN LEFT(COALESCE(p.VendorArticleName, ''), 4) = 'T_TR'
                THEN 'SuitCase' ELSE 'BackPack' END
       ) accessPending
       GROUP BY Category`
    ),
    query(
      `SELECT
         CASE WHEN COALESCE(d.VendorPrefix, '') = 'T_TR'
              THEN 'SuitCase' ELSE 'BackPack' END AS Category,
         COALESCE(SUM(d.DispatchQty), 0) AS DispatchQty
       FROM vwDispatchDetails d
       WHERE d.DispatchDate >= ?
         AND d.DispatchDate < ?
       GROUP BY CASE WHEN COALESCE(d.VendorPrefix, '') = 'T_TR'
                     THEN 'SuitCase' ELSE 'BackPack' END`,
      [period.from, period.to]
    ),
  ]);

  const pendingByCategory = Object.fromEntries(
    pendingRows.map((row) => [row.Category, Number(row.PendingQty || 0)])
  );
  const dispatchByCategory = Object.fromEntries(
    dispatchRows.map((row) => [row.Category, Number(row.DispatchQty || 0)])
  );

  const categoryStats = (category) => {
    const pendingOrders = pendingByCategory[category] || 0;
    const dispatchedLastMonth = dispatchByCategory[category] || 0;
    return {
      pendingOrders,
      dispatchedLastMonth,
      dispatchAverageLastMonth: dispatchedLastMonth / period.days,
      // The Access Backpack function currently evaluates its own empty return value,
      // so it always displays zero. Preserve that behavior for an exact dashboard match.
      daysOrderInHand: category === 'BackPack' ? 0 : Math.round(pendingOrders / 1000),
    };
  };

  return {
    periodLabel: period.label,
    suitcase: categoryStats('SuitCase'),
    backpack: categoryStats('BackPack'),
  };
}
