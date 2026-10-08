import "../env.js";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { db } from "./client.js";

async function migrate() {
  const dir = join(process.cwd(), "src", "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    console.log(`Running: ${file}`);
    const sql = readFileSync(join(dir, file), "utf8");
    try {
      await db.executeMultiple(sql);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // migrations re-run on every start, so an already-applied ADD COLUMN
      // or DROP COLUMN fails like this and is skipped.
      if (msg.includes("duplicate column name") || msg.includes("no such column")) {
        console.log("  Already applied, skipping.");
      } else {
        throw err;
      }
    }
  }
  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
