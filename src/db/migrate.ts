import "dotenv/config";
import { readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { db } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const dir = join(__dirname, "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    console.log(`Running: ${file}`);
    const sql = readFileSync(join(dir, file), "utf8");
    try {
      await db.executeMultiple(sql);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("duplicate column name")) {
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
