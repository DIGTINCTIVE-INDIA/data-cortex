import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)
    .filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const DBS = ["datacortex_resumption", "datacortex_rajan", "datacortex_demo_dev", "testing_data_cortex"];

for (const db of DBS) {
  const u = new URL(env.DATABASE_URL);
  u.pathname = "/" + db;
  const c = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    const t = await c.query(
      `select table_name from information_schema.tables
       where table_schema='public' and table_type='BASE TABLE' order by table_name`);
    const names = t.rows.map(r => r.table_name);

    // Earliest / latest created_at across any table that has one -- dates the DB.
    let lo = null, hi = null;
    for (const n of names) {
      const hasCol = await c.query(
        `select 1 from information_schema.columns
         where table_schema='public' and table_name=$1 and column_name='created_at'`, [n]);
      if (!hasCol.rowCount) continue;
      try {
        const r = await c.query(`select min(created_at) lo, max(created_at) hi from "${n}"`);
        if (r.rows[0].lo && (!lo || r.rows[0].lo < lo)) lo = r.rows[0].lo;
        if (r.rows[0].hi && (!hi || r.rows[0].hi > hi)) hi = r.rows[0].hi;
      } catch {}
    }
    console.log(`\n--- ${db} ---`);
    console.log(`  tables (${names.length}): ${names.join(", ")}`);
    console.log(`  earliest created_at: ${lo ? new Date(lo).toISOString() : "none"}`);
    console.log(`  latest   created_at: ${hi ? new Date(hi).toISOString() : "none"}`);
  } catch (e) {
    console.log(`\n--- ${db} ---\n  ERROR: ${e.message}`);
  } finally {
    await c.end().catch(() => {});
  }
}
