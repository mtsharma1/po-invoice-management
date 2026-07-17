const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  const now = new Date();
  const fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const toDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const sqlDate = (value) => [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');

  const [pending] = await connection.query(
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
  );
  const [dispatch] = await connection.query(
    `SELECT
       CASE WHEN COALESCE(d.VendorPrefix, '') = 'T_TR'
            THEN 'SuitCase' ELSE 'BackPack' END AS Category,
       COALESCE(SUM(d.DispatchQty), 0) AS DispatchQty
     FROM vwDispatchDetails d
     WHERE d.DispatchDate >= ? AND d.DispatchDate < ?
     GROUP BY CASE WHEN COALESCE(d.VendorPrefix, '') = 'T_TR'
                   THEN 'SuitCase' ELSE 'BackPack' END`,
    [sqlDate(fromDate), sqlDate(toDate)]
  );
  const [userCount] = await connection.query('SELECT COUNT(*) AS userCount FROM tblUsers');
  const [accessCount] = await connection.query('SELECT COUNT(*) AS accessCount FROM tblAccessType');

  console.log(JSON.stringify({
    period: `${sqlDate(fromDate)} to ${sqlDate(toDate)}`,
    pending,
    dispatch,
    users: userCount[0].userCount,
    accessTypes: accessCount[0].accessCount,
  }, null, 2));
  await connection.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
