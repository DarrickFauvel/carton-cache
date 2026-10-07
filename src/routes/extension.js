/**
 * Chrome extension download: an install-instructions page and a zip of the
 * built extension (extension/ with dist/ from `npm run build:extension`),
 * for loading unpacked in chrome://extensions until it's on the Web Store.
 */

import { Router } from "express";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireAuth } from "../middleware/auth.js";
import { createZip } from "../lib/zip.js";

const router = Router();

const extensionDir = join(process.cwd(), "extension");

/** Files Chrome needs to load the extension, relative to extension/. */
const FILES = ["manifest.json", "sidepanel.html", "sidepanel.css", "dist/background.js", "dist/sidepanel.js"];

router.get("/", requireAuth, async (req, res) => {
  const manifest = JSON.parse(await readFile(join(extensionDir, "manifest.json"), "utf8"));
  res.render("pages/extension/index", {
    title: "Chrome extension",
    version: manifest.version,
    origin: `${req.protocol}://${req.get("host")}`,
  });
});

router.get("/download", requireAuth, async (_req, res) => {
  let entries;
  try {
    entries = await Promise.all(
      FILES.map(async (name) => ({
        name: `carton-cache-extension/${name}`,
        data: await readFile(join(extensionDir, name)),
      }))
    );
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== "ENOENT") throw err;
    res.status(503).render("pages/error", {
      title: "Extension not built",
      message: "The extension hasn't been built on this server. Ask an admin to run npm run build:extension, then try again.",
    });
    return;
  }
  res.attachment("carton-cache-extension.zip");
  res.type("application/zip");
  res.send(createZip(entries));
});

export default router;
