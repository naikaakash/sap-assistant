/**
 * instrumentation.ts - Next.js boot-time hook.
 *
 * Runs once before the first request is served. When DATA_SOURCE=sql, we
 * pull each mock store's canonical record set from Azure SQL and write it
 * to the local JSON file BEFORE any request handler can call into the
 * sync init() of those stores. This is how SQL-backed state survives
 * container restarts: SQL is the source of truth; the JSON file is just
 * a per-process cache.
 *
 * If DATA_SOURCE=csv (default) this is a no-op.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const dataSource = (process.env.DATA_SOURCE || '').trim().toLowerCase();
  if (dataSource !== 'sql') {
    console.log(`[instrumentation] DATA_SOURCE=${dataSource || 'csv'} — skipping SQL boot.`);
    return;
  }

  try {
    const [{ bootFromSql: bootActions }, { bootFromSql: bootRecs }, { bootFromSql: bootComms }] =
      await Promise.all([
        import('@/src/services/mockActionStore'),
        import('@/src/services/mockRecommendationStore'),
        import('@/src/services/mockSupplierCommunicationStore'),
      ]);

    const [actions, recs, comms] = await Promise.all([
      bootActions(),
      bootRecs(),
      bootComms(),
    ]);

    console.log(
      `[instrumentation] SQL boot complete — actions=${actions} recommendations=${recs} reminders=${comms.reminders} responses=${comms.responses}`
    );
  } catch (err) {
    console.error('[instrumentation] SQL boot failed; app will use local JSON files:', err);
  }
}
