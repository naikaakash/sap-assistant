/**
 * sqlBlobStore.ts - Persists app-state JSON arrays to SQL.
 *
 * Each app-state table has the shape:
 *   id NVARCHAR(128) PRIMARY KEY
 *   data NVARCHAR(MAX) (the full record as JSON)
 *   created_at / updated_at DATETIME2
 *
 * The 4 mock stores hold homogeneous arrays of records each keyed by a string id.
 * This module provides:
 *
 *   pullRecordsFromSql<T>(table)       → reads SQL → array of parsed T objects
 *   pushRecordsToSql<T>(table, recs, idField) → DELETE + bulk INSERT (replace-all)
 *
 * Replace-all is fine for the current scale (a few hundred records max per store).
 * It also matches the JSON file semantics ("rewrite whole file"), so the calling
 * code doesn't need to track diffs.
 */

import { getSqlPool, sql } from './sqlClient';

function isSafeTableName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export async function pullRecordsFromSql<T>(table: string): Promise<T[]> {
  if (!isSafeTableName(table)) {
    throw new Error(`Unsafe table name: ${table}`);
  }
  const pool = await getSqlPool();
  const result = await pool.request().query(`SELECT [data] FROM [${table}] ORDER BY [created_at] ASC`);
  return result.recordset.map((row: { data: string }) => JSON.parse(row.data) as T);
}

export async function pushRecordsToSql<T>(
  table: string,
  records: T[],
  idField: keyof T
): Promise<void> {
  if (!isSafeTableName(table)) {
    throw new Error(`Unsafe table name: ${table}`);
  }
  const pool = await getSqlPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).query(`DELETE FROM [${table}]`);

    if (records.length > 0) {
      const tvp = new sql.Table(table);
      tvp.create = false;
      tvp.columns.add('id', sql.NVarChar(128), { nullable: false });
      tvp.columns.add('data', sql.NVarChar(sql.MAX), { nullable: false });
      tvp.columns.add('created_at', sql.DateTime2(3), { nullable: false });
      tvp.columns.add('updated_at', sql.DateTime2(3), { nullable: false });

      const now = new Date();
      const seenIds = new Set<string>();
      for (const record of records) {
        const idValue = (record as Record<string, unknown>)[idField as string];
        if (idValue === undefined || idValue === null || String(idValue) === '') continue;
        const idStr = String(idValue);
        if (seenIds.has(idStr)) continue; // dedupe defensively (PK would reject)
        seenIds.add(idStr);
        tvp.rows.add(idStr, JSON.stringify(record), now, now);
      }

      if (tvp.rows.length > 0) {
        await new sql.Request(tx).bulk(tvp);
      }
    }

    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}
