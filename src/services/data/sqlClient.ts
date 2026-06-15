/**
 * sqlClient.ts - shared Azure SQL connection pool + DATA_SOURCE env flag.
 *
 * The DATA_SOURCE env var controls whether the app reads/writes against
 * Azure SQL or falls back to the bundled CSV + local JSON files:
 *
 *   DATA_SOURCE=sql  → use the procurement DB
 *   DATA_SOURCE=csv  → use procurement_data_sample/*.csv + data/*.json (default)
 *
 * When DATA_SOURCE=sql, SQL_CONNECTION_STRING must be set (ADO.NET style).
 *
 * The pool is lazy: it's only opened on first use, so apps running in CSV mode
 * never pay a SQL connection cost and never need credentials.
 */

import sql from 'mssql';

export type DataSource = 'sql' | 'csv';

export function getDataSource(): DataSource {
  const raw = (process.env.DATA_SOURCE || '').trim().toLowerCase();
  if (raw === 'sql') return 'sql';
  return 'csv';
}

export function isSqlMode(): boolean {
  return getDataSource() === 'sql';
}

let _pool: sql.ConnectionPool | null = null;
let _connectPromise: Promise<sql.ConnectionPool> | null = null;

function parseAdoNetConnectionString(str: string): sql.config {
  const parts: Record<string, string> = {};
  for (const segment of str.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    parts[key] = trimmed.slice(eq + 1).trim();
  }
  const serverRaw = parts['server'] || parts['data source'] || '';
  const serverHost = serverRaw.replace(/^tcp:/i, '').split(',')[0];
  return {
    server: serverHost,
    database: parts['initial catalog'] || parts['database'] || '',
    user: parts['user id'] || parts['uid'] || '',
    password: parts['password'] || parts['pwd'] || '',
    options: {
      encrypt: true,
      trustServerCertificate: false,
      connectTimeout: 30000,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  };
}

export async function getSqlPool(): Promise<sql.ConnectionPool> {
  if (_pool && _pool.connected) return _pool;
  if (_connectPromise) return _connectPromise;

  const connStr = process.env.SQL_CONNECTION_STRING;
  if (!connStr) {
    throw new Error(
      'SQL_CONNECTION_STRING is not set but DATA_SOURCE=sql requires it. ' +
        'Either set the connection string or switch DATA_SOURCE=csv.'
    );
  }

  const config = parseAdoNetConnectionString(connStr);
  _connectPromise = sql
    .connect(config)
    .then((pool) => {
      _pool = pool;
      console.log(`[sqlClient] Connected to ${config.server}/${config.database}`);
      pool.on('error', (err) => {
        console.error('[sqlClient] Pool error:', err);
      });
      return pool;
    })
    .catch((err) => {
      _connectPromise = null;
      throw err;
    });
  return _connectPromise;
}

export async function closeSqlPool(): Promise<void> {
  if (_pool) {
    try {
      await _pool.close();
    } catch (err) {
      console.error('[sqlClient] Error closing pool:', err);
    } finally {
      _pool = null;
      _connectPromise = null;
    }
  }
}

export { sql };
