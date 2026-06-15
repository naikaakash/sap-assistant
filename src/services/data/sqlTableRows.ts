/**
 * sqlTableRows.ts - Fetches all rows from a reference table as plain string objects.
 *
 * Returns rows in the exact same shape that csvtojson would produce, so callers
 * (notably csvDataService.readCsv) can swap source without any downstream changes.
 *
 * Since the loader (scripts/seed-sql.js) stores every column as NVARCHAR, every
 * value is already a string in SQL. We pass them through unchanged.
 */

import { getSqlPool, sql } from './sqlClient';

interface CacheEntry {
  rows: Array<Record<string, string | null>>;
  fetchedAt: number;
}

const TTL_MS = 60_000; // 60s in-memory cache to amortize SQL hits
const cache = new Map<string, CacheEntry>();

function tableFromFilename(filename: string): string {
  // e.g. 'purchase_order_headers.csv' → 'purchase_order_headers'
  return filename.replace(/\.csv$/i, '');
}

function isSafeTableName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export function clearSqlRowCache(): void {
  cache.clear();
}

export async function loadTableRows(
  filename: string
): Promise<Array<Record<string, string | null>>> {
  const table = tableFromFilename(filename);
  if (!isSafeTableName(table)) {
    console.error(`[sqlTableRows] Unsafe table name derived from ${filename}: ${table}`);
    return [];
  }

  const cached = cache.get(table);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.rows;
  }

  try {
    const pool = await getSqlPool();
    const result = await pool.request().query(`SELECT * FROM [${table}]`);
    const rows = result.recordset.map((row: Record<string, unknown>) => {
      const out: Record<string, string | null> = {};
      for (const key of Object.keys(row)) {
        // Skip the synthetic surrogate column added by the seeder
        if (key === '_row_id') continue;
        const value = row[key];
        if (value === null || value === undefined) {
          out[key] = '';
        } else {
          out[key] = String(value);
        }
      }
      return out;
    });
    cache.set(table, { rows, fetchedAt: Date.now() });
    return rows;
  } catch (err) {
    console.error(`[sqlTableRows] Failed to read table ${table}:`, err);
    return [];
  }
}
