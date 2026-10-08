/**
 * Location names were unique per org (a table-level UNIQUE (org_id, name)),
 * which stops two locations from each having a "Stack 1". SQLite can't drop
 * a table constraint, so this rebuilds the table without it and adds a
 * unique index on (org_id, parent, name) instead. COALESCE makes top-level
 * names (parent_id NULL) unique among themselves, since NULLs never clash in
 * a plain UNIQUE.
 *
 * Unlike 004, this never renames the live table (which made SQLite rewrite
 * the FK clauses in inventory_lots/transactions/alert_thresholds to point at
 * the renamed-away copy): it builds locations_new, drops locations with FK
 * enforcement off, and renames the new table into place, all in one
 * transaction. Migrations re-run on every start, so it only rebuilds while
 * the old constraint is still there. If the rebuild fails it is rolled back
 * and logged rather than thrown: names just stay unique per org, and the
 * server still starts.
 * @param {import("@libsql/client").Client} db
 */
export default async function migrate(db) {
  const table = await db.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'locations'");
  const sql = String(table.rows[0]?.sql ?? "");
  if (!/UNIQUE\s*\(\s*org_id\s*,\s*name\s*\)/i.test(sql)) return;

  const columns = (await db.execute("PRAGMA table_info(locations)")).rows.map((r) => String(r.name));
  const expected = ["id", "name", "address", "active", "created_at", "org_id", "parent_id"];
  if (columns.length !== expected.length || !expected.every((c) => columns.includes(c))) {
    console.warn(`  Skipped: unexpected locations columns (${columns.join(", ")}).`);
    return;
  }

  const cols = expected.join(", ");
  try {
    await db.executeMultiple(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      DROP TABLE IF EXISTS locations_new;
      CREATE TABLE locations_new (
        id         TEXT    PRIMARY KEY,
        name       TEXT    NOT NULL,
        address    TEXT,
        active     INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        org_id     TEXT    NOT NULL DEFAULT '01JDEFAULTORG0000000000001',
        parent_id  TEXT    REFERENCES locations(id)
      );
      INSERT INTO locations_new (${cols}) SELECT ${cols} FROM locations;
      DROP TABLE locations;
      ALTER TABLE locations_new RENAME TO locations;
      CREATE INDEX IF NOT EXISTS idx_locations_org ON locations (org_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_org_parent_name ON locations (org_id, COALESCE(parent_id, ''), name);
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  } catch (err) {
    await db.execute("ROLLBACK").catch(() => {});
    await db.execute("PRAGMA foreign_keys = ON").catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  Rebuild failed and was rolled back; location names stay unique per org. (${msg})`);
    return;
  }

  const broken = await db.execute("PRAGMA foreign_key_check");
  if (broken.rows.length > 0) {
    console.warn(`  Warning: foreign_key_check reports ${broken.rows.length} problem(s) after the rebuild.`);
  }
}
