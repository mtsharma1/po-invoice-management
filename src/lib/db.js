import mysql from 'mysql2/promise';

const globalForMysql = globalThis;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured. Create .env.local from .env.example.`);
  }
  return value;
}

export function getPool() {
  // Keep one shared pool during Next.js dev reloads so old module instances do not exhaust MySQL.
  if (!globalForMysql.__teakwoodMysqlPool) {
    globalForMysql.__teakwoodMysqlPool = mysql.createPool({
      host: requiredEnv('MYSQL_HOST'),
      port: Number(process.env.MYSQL_PORT || 3306),
      database: requiredEnv('MYSQL_DATABASE'),
      user: requiredEnv('MYSQL_USER'),
      password: requiredEnv('MYSQL_PASSWORD'),
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 3),
      maxIdle: Number(process.env.MYSQL_MAX_IDLE || 3),
      idleTimeout: Number(process.env.MYSQL_IDLE_TIMEOUT || 60000),
      queueLimit: 0,
      decimalNumbers: true,
      dateStrings: true,
      namedPlaceholders: false,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
  }

  return globalForMysql.__teakwoodMysqlPool;
}

export async function query(sql, params = []) {
  // Hostinger/MySQL can reject some server-side prepared statements such as LIMIT
  // placeholders with "Incorrect arguments to mysqld_stmt_execute". mysql2.query
  // still safely escapes the params, but avoids server-side prepared execution.
  const [rows] = await getPool().query(sql, params);
  return rows;
}

export async function withTransaction(work) {
  const connection = await getPool().getConnection();
  const run = async (sql, params = []) => {
    const [rows] = await connection.query(sql, params);
    return rows;
  };

  try {
    await connection.beginTransaction();
    const result = await work(run, connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function pingDatabase() {
  const rows = await query('SELECT 1 AS ok');
  return rows?.[0]?.ok === 1;
}
