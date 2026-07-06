import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { ulid, now, str, defined } from "../lib/id.js";
import * as cartonSuggest from "../services/carton-suggest.js";
import { buildLabelCode } from "../lib/labels.js";

/** @typedef {import("../types.js").CartonType} CartonType */

const router = Router();

const FORM_SCRIPTS = ["barcode-scanner"];

/** @param {Record<string, string | string[]>} body */
function parseCartonBody(body) {
  const name        = str(body.name);
  const sku         = str(body.sku);
  const barcode     = str(body.barcode);
  const length_cm   = str(body.length_cm);
  const width_cm    = str(body.width_cm);
  const height_cm   = str(body.height_cm);
  const unit_cost   = str(body.unit_cost);
  const notes       = str(body.notes);
  const source_code = str(body.source_code);
  const size_code   = str(body.size_code);
  return {
    name:        name.trim(),
    sku:         sku.trim()       || null,
    barcode:     barcode.trim()   || null,
    length_cm:   length_cm ? parseFloat(length_cm) : null,
    width_cm:    width_cm  ? parseFloat(width_cm)  : null,
    height_cm:   height_cm ? parseFloat(height_cm) : null,
    unit_cost:   unit_cost ? parseFloat(unit_cost) : null,
    notes:       notes.trim()     || null,
    source_code: source_code.trim() || null,
    size_code:   size_code.trim()   || null,
  };
}

/**
 * @param {Record<string, unknown>[]} rows
 * @returns {(Record<string, unknown> & { label_code: string | null })[]}
 */
function withLabelCode(rows) {
  return rows.map((row) => ({ ...row, label_code: buildLabelCode(/** @type {CartonType} */ (row)) }));
}

/**
 * @param {unknown} err
 * @returns {string | null}
 */
function constraintMessage(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("UNIQUE") && msg.includes("sku")) return "A carton type with that SKU already exists.";
  if (msg.includes("UNIQUE") && msg.includes("barcode")) return "A carton type with that barcode already exists.";
  return null;
}

router.get("/lookup", requireAuth, async (req, res) => {
  const barcode = String(req.query.barcode ?? "").trim();
  if (!barcode) return res.status(400).json({ error: "barcode required" });
  const result = await db.execute({
    sql: "SELECT id, name, sku FROM carton_types WHERE barcode = ? AND org_id = ?",
    args: [barcode, defined(req.session.orgId)],
  });
  if (!result.rows[0]) return res.status(404).json({ error: "No carton with that barcode." });
  res.json(result.rows[0]);
});

router.get("/suggest", requireAuth, async (req, res) => {
  const length = parseFloat(String(req.query.length_cm ?? ""));
  const width = parseFloat(String(req.query.width_cm ?? ""));
  const height = parseFloat(String(req.query.height_cm ?? ""));
  const dunnage = req.query.dunnage_cm !== undefined ? parseFloat(String(req.query.dunnage_cm)) : 2.5;
  const locationId = req.query.location_id ? String(req.query.location_id) : undefined;

  if (![length, width, height].every((n) => Number.isFinite(n) && n > 0)) {
    return res.status(400).json({ error: "length_cm, width_cm, and height_cm are required and must be positive numbers." });
  }
  if (!Number.isFinite(dunnage) || dunnage < 0) {
    return res.status(400).json({ error: "dunnage_cm must be a non-negative number." });
  }

  const result = await cartonSuggest.suggest({
    orgId: defined(req.session.orgId),
    lengthCm: length,
    widthCm: width,
    heightCm: height,
    dunnageCm: dunnage,
    locationId,
  });
  res.json(result);
});

router.get("/:id/label", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: "SELECT * FROM carton_types WHERE id = ? AND org_id = ?",
    args: [str(req.params.id), defined(req.session.orgId)],
  });
  const carton = /** @type {CartonType | undefined} */ (/** @type {unknown} */ (result.rows[0]));
  const labelCode = carton ? buildLabelCode(carton) : null;
  if (!carton || !labelCode) return res.redirect("/cartons");
  res.render("pages/cartons/label", { labelCode, cartonName: carton.name });
});

router.get("/", requireAuth, async (req, res) => {
  const result = await db.execute({ sql: "SELECT * FROM carton_types WHERE org_id = ? ORDER BY name", args: [defined(req.session.orgId)] });
  res.render("pages/cartons/index", {
    title: "Carton Types",
    cartons: withLabelCode(result.rows),
    saved: false,
  });
});

router.get("/new", requireRole("admin", "manager"), (_req, res) => {
  res.render("pages/cartons/form", {
    title: "New Carton Type",
    carton: null,
    error: null,
    componentScripts: FORM_SCRIPTS,
  });
});

router.post("/", requireRole("admin", "manager"), async (req, res) => {
  const fields = parseCartonBody(req.body);
  const wantsJson = req.headers.accept?.includes("application/json") ?? false;

  if (!fields.name) {
    if (wantsJson) return res.status(400).json({ error: "Name is required." });
    return res.render("pages/cartons/form", {
      title: "New Carton Type",
      carton: req.body,
      error: "Name is required.",
      componentScripts: FORM_SCRIPTS,
    });
  }

  const id = ulid();
  try {
    await db.execute({
      sql: `INSERT INTO carton_types (id, name, sku, barcode, length_cm, width_cm, height_cm, unit_cost, notes, source_code, size_code, org_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, fields.name, fields.sku, fields.barcode,
             fields.length_cm, fields.width_cm, fields.height_cm,
             fields.unit_cost, fields.notes, fields.source_code, fields.size_code,
             defined(req.session.orgId), now()],
    });
  } catch (err) {
    const error = constraintMessage(err) ?? "Could not save carton type. Please try again.";
    if (wantsJson) return res.status(409).json({ error });
    return res.render("pages/cartons/form", {
      title: "New Carton Type",
      carton: req.body,
      error,
      componentScripts: FORM_SCRIPTS,
    });
  }

  if (wantsJson) return res.json({ id, name: fields.name, sku: fields.sku });
  res.redirect("/cartons?saved=1");
});

router.get("/:id/edit", requireRole("admin", "manager"), async (req, res) => {
  const result = await db.execute({
    sql: "SELECT * FROM carton_types WHERE id = ? AND org_id = ?",
    args: [str(req.params.id), defined(req.session.orgId)],
  });
  if (!result.rows[0]) return res.redirect("/cartons");
  res.render("pages/cartons/form", {
    title: "Edit Carton Type",
    carton: result.rows[0],
    error: null,
    componentScripts: FORM_SCRIPTS,
  });
});

router.post("/:id/edit", requireRole("admin", "manager"), async (req, res) => {
  const id = str(req.params.id);
  const orgId = defined(req.session.orgId);
  const fields = parseCartonBody(req.body);
  if (!fields.name) {
    const result = await db.execute({ sql: "SELECT * FROM carton_types WHERE id = ? AND org_id = ?", args: [id, orgId] });
    return res.render("pages/cartons/form", {
      title: "Edit Carton Type",
      carton: { ...result.rows[0], ...req.body },
      error: "Name is required.",
      componentScripts: FORM_SCRIPTS,
    });
  }
  try {
    await db.execute({
      sql: `UPDATE carton_types SET name=?, sku=?, barcode=?, length_cm=?, width_cm=?, height_cm=?, unit_cost=?, notes=?, source_code=?, size_code=?
            WHERE id=? AND org_id=?`,
      args: [fields.name, fields.sku, fields.barcode,
             fields.length_cm, fields.width_cm, fields.height_cm,
             fields.unit_cost, fields.notes, fields.source_code, fields.size_code, id, orgId],
    });
  } catch (err) {
    const result = await db.execute({ sql: "SELECT * FROM carton_types WHERE id = ? AND org_id = ?", args: [id, orgId] });
    return res.render("pages/cartons/form", {
      title: "Edit Carton Type",
      carton: { ...result.rows[0], ...req.body },
      error: constraintMessage(err) ?? "Could not save changes. Please try again.",
      componentScripts: FORM_SCRIPTS,
    });
  }
  res.redirect("/cartons?saved=1");
});

router.post("/:id/delete", requireRole("admin", "manager"), async (req, res) => {
  const id = str(req.params.id);

  // Block deletion if the type has any transaction history or live stock
  const orgId = defined(req.session.orgId);
  const [txCount, lotCount] = await Promise.all([
    db.execute({ sql: "SELECT COUNT(*) AS n FROM transactions WHERE carton_type_id = ? AND org_id = ?", args: [id, orgId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM inventory_lots WHERE carton_type_id = ? AND quantity > 0 AND org_id = ?", args: [id, orgId] }),
  ]);

  if (Number(txCount.rows[0]?.n) > 0 || Number(lotCount.rows[0]?.n) > 0) {
    const result = await db.execute({ sql: "SELECT * FROM carton_types WHERE org_id = ? ORDER BY name", args: [orgId] });
    return res.render("pages/cartons/index", {
      title: "Carton Types",
      cartons: withLabelCode(result.rows),
      saved: false,
      deleteError: "Cannot delete a carton type that has transactions or stock on hand.",
    });
  }

  await db.execute({ sql: "DELETE FROM carton_types WHERE id = ? AND org_id = ?", args: [id, orgId] });
  res.redirect("/cartons?saved=1");
});

export default router;
