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

const categoryExpression = `
  CASE
    WHEN NULLIF(TRIM(p.Category), '') IS NOT NULL THEN TRIM(p.Category)
    WHEN LEFT(COALESCE(p.VendorArticleName, ''), 4) = 'T_TR' THEN 'SuitCase'
    ELSE 'BackPack'
  END
`;

export async function getDashboardStats() {
  const period = previousDashboardMonth();
  const [pendingRows, dispatchRows, yesterdayRows] = await Promise.all([
    query(
      `SELECT Category, COALESCE(SUM(PendingQty), 0) AS PendingQty
       FROM (
         SELECT
           ${categoryExpression} AS Category,
           GREATEST(COALESCE(p.Quantity, 0) - COALESCE(d.DispatchQty, 0), 0) AS PendingQty
         FROM tblPODetails p
         LEFT JOIN (
           SELECT POID, COALESCE(SUM(DispatchQty), 0) AS DispatchQty
           FROM tblDispatch
           GROUP BY POID
         ) d ON d.POID = p.POID
       ) categoryPending
       GROUP BY Category`
    ),
    query(
      `SELECT
         ${categoryExpression} AS Category,
         COALESCE(SUM(d.DispatchQty), 0) AS DispatchQty
       FROM tblDispatch d
       INNER JOIN tblPODetails p ON p.POID = d.POID
       WHERE d.DispatchDate >= ?
         AND d.DispatchDate < ?
       GROUP BY ${categoryExpression}`,
      [period.from, period.to]
    ),
    query(
      `SELECT
         ${categoryExpression} AS Category,
         COALESCE(SUM(d.DispatchQty), 0) AS DispatchQty
       FROM tblDispatch d
       INNER JOIN tblPODetails p ON p.POID = d.POID
       WHERE d.DispatchDate >= CURRENT_DATE - INTERVAL 1 DAY
         AND d.DispatchDate < CURRENT_DATE
       GROUP BY ${categoryExpression}`
    ),
  ]);

  const pendingByCategory = rowsToQuantityMap(pendingRows, 'PendingQty');
  const dispatchByCategory = rowsToQuantityMap(dispatchRows, 'DispatchQty');
  const yesterdayByCategory = rowsToQuantityMap(yesterdayRows, 'DispatchQty');
  const categoryNames = Array.from(new Set([
    ...Object.keys(pendingByCategory),
    ...Object.keys(dispatchByCategory),
    ...Object.keys(yesterdayByCategory),
  ])).sort((left, right) => left.localeCompare(right, 'en-IN', { sensitivity: 'base' }));

  const categories = categoryNames.map((categoryName) => {
    const pendingOrders = pendingByCategory[categoryName] || 0;
    const dispatchedLastMonth = dispatchByCategory[categoryName] || 0;
    return {
      categoryName,
      pendingOrders,
      dispatchedLastMonth,
      dispatchAverageLastMonth: dispatchedLastMonth / period.days,
      daysOrderInHand: Math.round(pendingOrders / 1000),
      yesterdayDispatch: yesterdayByCategory[categoryName] || 0,
    };
  });

  return {
    periodLabel: period.label,
    categories,
  };
}

function rowsToQuantityMap(rows, quantityColumn) {
  return Object.fromEntries(
    rows.map((row) => [String(row.Category || '').trim(), Number(row[quantityColumn] || 0)])
      .filter(([category]) => category)
  );
}
