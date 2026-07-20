const { loadEnvConfig } = require('@next/env');
const mysql = require('mysql2/promise');

loadEnvConfig(process.cwd());

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
  });

  try {
    const result = {};
    for (const table of ['tblPOHeaders', 'tblPODetails', 'tblShellOrders', 'tblDispatch', 'vwPODetails']) {
      try {
        const [columns] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
        result[table] = columns.map(({ Field, Type, Null, Key, Default }) => ({ Field, Type, Null, Key, Default }));
      } catch (error) {
        result[table] = { error: error.message };
      }
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
