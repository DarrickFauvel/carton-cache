import "../env.js";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { db } from "./client.js";

async function migrate() {
  const dir = join(process.cwd(), "src", "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql") || f.endsWith(".js")).sort();

  for (const file of files) {
    console.log(`Running: ${file}`);
    try {
      if (file.endsWith(".js")) {
        // For changes plain SQL can't express safely, e.g. a table rebuild
        // that must only run once. Default export: async (db) => void. It
        // runs on every start like the .sql files, so it must be idempotent.
        const { default: run } = await import(pathToFileURL(join(dir, file)).href);
        await run(db);
        continue;
      }
      await db.executeMultiple(readFileSync(join(dir, file), "utf8"));
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
