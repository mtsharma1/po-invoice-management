const { loadEnvConfig } = require('@next/env');
const mysql = require('mysql2/promise');

loadEnvConfig(process.cwd());

async function main() {
  const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing environment values: ${missing.join(', ')}`);
  }

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
  });

  const [rows] = await connection.execute('SELECT DATABASE() AS dbName, NOW() AS serverTime');
  await connection.end();
  console.log(`Connected to ${rows[0].dbName} at ${rows[0].serverTime}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
