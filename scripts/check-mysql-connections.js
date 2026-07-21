const { loadEnvConfig } = require("@next/env");
const mysql = require("mysql2/promise");

loadEnvConfig(process.cwd());

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    connectTimeout: 15000,
  });

  try {
    const [serverRows] = await connection.query(`
      SELECT
        DATABASE() AS databaseName,
        CURRENT_USER() AS currentUser,
        @@hostname AS serverHost,
        @@port AS serverPort,
        VERSION() AS version,
        NOW() AS serverTime
    `);

    const [statusRows] = await connection.query(`
      SHOW GLOBAL STATUS
      WHERE Variable_name IN (
        'Threads_connected',
        'Threads_running',
        'Max_used_connections',
        'Connections',
        'Aborted_connects'
      )
    `);

    const [variableRows] = await connection.query(`
      SHOW GLOBAL VARIABLES
      WHERE Variable_name IN (
        'max_connections',
        'wait_timeout',
        'interactive_timeout'
      )
    `);

    let processRows;
    try {
      [processRows] = await connection.query(`
        SELECT
          ID,
          USER,
          SUBSTRING_INDEX(HOST, ':', 1) AS clientHost,
          DB,
          COMMAND,
          TIME,
          STATE
        FROM information_schema.PROCESSLIST
        ORDER BY (COMMAND <> 'Sleep') DESC, TIME DESC
        LIMIT 25
      `);
    } catch (error) {
      processRows = [{
        note: "Process list is unavailable for this database user.",
        reason: error.message,
      }];
    }

    const status = Object.fromEntries(
      statusRows.map((row) => [row.Variable_name, Number(row.Value)]),
    );
    const variables = Object.fromEntries(
      variableRows.map((row) => [row.Variable_name, Number(row.Value)]),
    );
    const connectionUsagePercent = variables.max_connections
      ? Number(((status.Threads_connected / variables.max_connections) * 100).toFixed(2))
      : null;

    console.log(JSON.stringify({
      server: serverRows[0],
      status,
      variables,
      connectionUsagePercent,
      sessionsVisibleToCurrentUser: processRows,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    code: error.code,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
});
