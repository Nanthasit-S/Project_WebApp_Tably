import mariadb, { PoolConnection } from "mariadb";

declare global {
  var mariadbPool: mariadb.Pool | undefined;
  var mariadbPoolCleanupRegistered: boolean | undefined;
  var mariadbPoolClosing: boolean | undefined;
}

const poolConfig = {
  host: process.env.MARIADB_HOST,
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  port: process.env.MARIADB_PORT
    ? parseInt(process.env.MARIADB_PORT, 10)
    : 3306,
  connectionLimit: 10,
  acquireTimeout: 15000,
  connectTimeout: 10000,
  idleTimeout: 30,
};

export const pool = global.mariadbPool || mariadb.createPool(poolConfig);

const registerGracefulShutdown = () => {
  if (global.mariadbPoolCleanupRegistered) {
    return;
  }

  const closePool = async () => {
    if (global.mariadbPoolClosing) {
      return;
    }

    global.mariadbPoolClosing = true;

    try {
      await pool.end();
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Failed to close MariaDB pool gracefully:", error);
      }
    }
  };

  const terminateProcess = (code: number) => {
    if (typeof process.exit === "function") {
      process.exit(code);
    }
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    void (async () => {
      await closePool();

      const exitCode = signal === "SIGINT" ? 130 : 0;
      terminateProcess(exitCode);
    })();
  };

  const handleBeforeExit = () => {
    void closePool();
  };

  process.once("beforeExit", handleBeforeExit);
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  global.mariadbPoolCleanupRegistered = true;
};

registerGracefulShutdown();

if (process.env.NODE_ENV !== "production") {
  global.mariadbPool = pool;
}

type QueryParams = ReadonlyArray<unknown> | Record<string, unknown> | undefined;

export async function withConnection<T>(
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();

  try {
    return await fn(conn);
  } finally {
    conn.release();
  }
}

export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await fn(conn);

      await conn.commit();

      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
}

export async function queryRows<Row = Record<string, unknown>>(
  sql: string,
  params?: QueryParams,
): Promise<Row[]> {
  const result = await pool.query(sql, params);

  return Array.isArray(result) ? (result as Row[]) : [];
}

export async function querySingle<Row = Record<string, unknown>>(
  sql: string,
  params?: QueryParams,
): Promise<Row | null> {
  const rows = await queryRows<Row>(sql, params);

  return rows.length > 0 ? rows[0] : null;
}