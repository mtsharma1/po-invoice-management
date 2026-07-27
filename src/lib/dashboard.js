import { query } from './db';

function previousDashboardMonth(reference = new Date()) {
  const previousMonthStart = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  const currentMonthStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const daysInPreviousMonth = new Date(reference.getFullYear(), reference.getMonth(), 0).getDate();
  const sqlDate = (value) => [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');

  return {
    from: sqlDate(previousMonthStart),
    to: sqlDate(currentMonthStart),
    days: daysInPreviousMonth,
    label: previousMonthStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
  };
}

export async function getDashboardStats() {
  const period = previousDashboardMonth();
  const [pendingRows, dispatchRows, yesterdayRows] = await Promise.all([
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
    query(
      `SELECT
         CASE WHEN COALESCE(d.VendorPrefix, '') = 'T_TR'
              THEN 'SuitCase' ELSE 'BackPack' END AS Category,
         COALESCE(SUM(d.DispatchQty), 0) AS DispatchQty
       FROM vwDispatchDetails d
       WHERE d.DispatchDate >= CURRENT_DATE - INTERVAL 1 DAY
         AND d.DispatchDate < CURRENT_DATE
       GROUP BY CASE WHEN COALESCE(d.VendorPrefix, '') = 'T_TR'
                     THEN 'SuitCase' ELSE 'BackPack' END`
    ),
  ]);

  const pendingByCategory = Object.fromEntries(
    pendingRows.map((row) => [row.Category, Number(row.PendingQty || 0)])
  );
  const dispatchByCategory = Object.fromEntries(
    dispatchRows.map((row) => [row.Category, Number(row.DispatchQty || 0)])
  );
  const yesterdayByCategory = Object.fromEntries(
    yesterdayRows.map((row) => [row.Category, Number(row.DispatchQty || 0)])
  );

  const categoryStats = (category) => {
    const pendingOrders = pendingByCategory[category] || 0;
    const dispatchedLastMonth = dispatchByCategory[category] || 0;
    return {
      pendingOrders,
      dispatchedLastMonth,
      dispatchAverageLastMonth: dispatchedLastMonth / period.days,
      daysOrderInHand: Math.round(pendingOrders / 1000),
      yesterdayDispatch: yesterdayByCategory[category] || 0,
    };
  };

  return {
    periodLabel: period.label,
    suitcase: categoryStats('SuitCase'),
    backpack: categoryStats('BackPack'),
  };
}
