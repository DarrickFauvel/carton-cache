import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { ulid, now, str, defined } from "../lib/id.js";
import * as cartonSuggest from "../services/carton-suggest.js";
import { buildLabelCode } from "../lib/labels.js";
import { parseUnit, toCm, fromCm, cartonLabel, DEFAULT_WALL_THICKNESS_CM } from "../lib/units.js";

/** @typedef {import("../types.js").CartonType} CartonType */

const router = Router();

const FORM_SCRIPTS = ["barcode-scanner", "label-preview"];

/**
 * Dimensions arrive as `length`/`width`/`height` (actual inside, measured),
 * `printed_length`/`printed_width`/`printed_height` (the size printed on the
 * box) and `wall_thickness`, all in the form's `dim_unit` (the org's display
 * unit when the form was rendered), and are stored in cm. A blank or invalid
 * wall thickness falls back to the default.
 * @param {Record<string, string | string[]>} body
 */
function parseCartonBody(body) {
  const name        = str(body.name);
  const sku         = str(body.sku);
  const barcode     = str(body.barcode);
  const unit        = parseUnit(str(body.dim_unit));
  const length      = str(body.length);
  const width       = str(body.width);
  const height      = str(body.height);
  const wall        = parseFloat(str(body.wall_thickness));
  /** @param {string} value */
  const cm = (value) => (value ? toCm(parseFloat(value), unit) : null);
  const unit_cost   = str(body.unit_cost);
  const notes       = str(body.notes);
  const source_code = str(body.source_code);
  const resizable   = str(body.resizable);
  return {
    name:        name.trim(),
    sku:         sku.trim()       || null,
    barcode:     barcode.trim()   || null,
    length_cm:   length ? toCm(parseFloat(length), unit) : null,
    width_cm:    width  ? toCm(parseFloat(width), unit)  : null,
    height_cm:   height ? toCm(parseFloat(height), unit) : null,
    printed_length_cm: cm(str(body.printed_length)),
    printed_width_cm:  cm(str(body.printed_width)),
    printed_height_cm: cm(str(body.printed_height)),
    wall_thickness_cm: Number.isFinite(wall) && wall >= 0 ? toCm(wall, unit) : DEFAULT_WALL_THICKNESS_CM,
    unit_cost:   unit_cost ? parseFloat(unit_cost) : 0,
    notes:       notes.trim()     || null,
    source_code: source_code.trim() || null,
    resizable:   resizable ? 1 : 0,
  };
}

/**
 * Distinct label source codes already used in the org, offered as
 * suggestions on the carton form (new codes can still be typed freely).
 * @param {string} orgId
 * @returns {Promise<{ sourceCodes: string[] }>}
 */
async function labelCodeOptions(orgId) {
  const sources = await db.execute({ sql: "SELECT DISTINCT source_code AS code FROM carton_types WHERE org_id = ? AND source_code IS NOT NULL ORDER BY code", args: [orgId] });
  return { sourceCodes: sources.rows.map((r) => String(r.code)) };
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {{ title: string; carton: unknown; error: string | null }} data
 */
async function renderForm(req, res, data) {
  const unit = parseUnit(req.session.orgUnit);
  res.render("pages/cartons/form", {
    ...data,
    ...(await labelCodeOptions(defined(req.session.orgId))),
    defaultWallThicknessCm: DEFAULT_WALL_THICKNESS_CM,
    // 3 decimals, so 1/8 in shows as 0.125 rather than rounding to 0.13.
    toWallUnit: (/** @type {number} */ cm) => fromCm(cm, unit, 3),
    componentScripts: FORM_SCRIPTS,
  });
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
    sql: "SELECT id, name, length_cm, width_cm, height_cm, printed_length_cm, printed_width_cm, printed_height_cm FROM carton_types WHERE barcode = ? AND org_id = ?",
    args: [barcode, defined(req.session.orgId)],
  });
  if (!result.rows[0]) return res.status(404).json({ error: "No carton with that barcode." });
  const carton = /** @type {{ id: string; name: string; length_cm: number | null; width_cm: number | null; height_cm: number | null; printed_length_cm: number | null; printed_width_cm: number | null; printed_height_cm: number | null }} */ (/** @type {unknown} */ (result.rows[0]));
  res.json({ id: carton.id, name: carton.name, label: cartonLabel(carton, parseUnit(req.session.orgUnit)) });
});

router.get("/suggest", requireAuth, async (req, res) => {
  const parsed = cartonSuggest.parseSuggestQuery(req.query, defined(req.session.orgId));
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });
  res.json(await cartonSuggest.suggest(parsed.args));
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

router.get("/new", requireRole("admin", "manager"), async (req, res) => {
  await renderForm(req, res, {
    title: "New Carton Type",
    carton: null,
    error: null,
  });
});

router.post("/", requireRole("admin", "manager"), async (req, res) => {
  const fields = parseCartonBody(req.body);
  const wantsJson = req.headers.accept?.includes("application/json") ?? false;

  if (!fields.name) {
    if (wantsJson) return res.status(400).json({ error: "Name is required." });
    return renderForm(req, res, {
      title: "New Carton Type",
      carton: req.body,
      error: "Name is required.",
    });
  }

  const id = ulid();
  try {
    await db.execute({
      sql: `INSERT INTO carton_types (id, name, sku, barcode, length_cm, width_cm, height_cm,
                                      printed_length_cm, printed_width_cm, printed_height_cm, wall_thickness_cm,
                                      unit_cost, notes, source_code, resizable, org_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, fields.name, fields.sku, fields.barcode,
             fields.length_cm, fields.width_cm, fields.height_cm,
             fields.printed_length_cm, fields.printed_width_cm, fields.printed_height_cm, fields.wall_thickness_cm,
             fields.unit_cost, fields.notes, fields.source_code, fields.resizable,
             defined(req.session.orgId), now()],
    });
  } catch (err) {
    const error = constraintMessage(err) ?? "Could not save carton type. Please try again.";
    if (wantsJson) return res.status(409).json({ error });
    return renderForm(req, res, {
      title: "New Carton Type",
      carton: req.body,
      error,
    });
  }

  if (wantsJson) return res.json({ id, name: fields.name, label: cartonLabel(fields, parseUnit(req.session.orgUnit)) });
  res.redirect("/cartons?saved=1");
});

router.get("/:id/edit", requireRole("admin", "manager"), async (req, res) => {
  const result = await db.execute({
    sql: "SELECT * FROM carton_types WHERE id = ? AND org_id = ?",
    args: [str(req.params.id), defined(req.session.orgId)],
  });
  if (!result.rows[0]) return res.redirect("/cartons");
  await renderForm(req, res, {
    title: "Edit Carton Type",
    // Spread into a plain object: libsql rows are array-like, and their
    // non-enumerable `length` (the column count) would otherwise be read by
    // the form as the submitted `length` dimension.
    carton: { ...result.rows[0] },
    error: null,
  });
});

router.post("/:id/edit", requireRole("admin", "manager"), async (req, res) => {
  const id = str(req.params.id);
  const orgId = defined(req.session.orgId);
  const fields = parseCartonBody(req.body);
  if (!fields.name) {
    const result = await db.execute({ sql: "SELECT * FROM carton_types WHERE id = ? AND org_id = ?", args: [id, orgId] });
    return renderForm(req, res, {
      title: "Edit Carton Type",
      carton: { ...result.rows[0], ...req.body },
      error: "Name is required.",
    });
  }
  try {
    await db.execute({
      sql: `UPDATE carton_types SET name=?, sku=?, barcode=?, length_cm=?, width_cm=?, height_cm=?,
                   printed_length_cm=?, printed_width_cm=?, printed_height_cm=?, wall_thickness_cm=?, unit_cost=?, notes=?, source_code=?, resizable=?
            WHERE id=? AND org_id=?`,
      args: [fields.name, fields.sku, fields.barcode,
             fields.length_cm, fields.width_cm, fields.height_cm,
             fields.printed_length_cm, fields.printed_width_cm, fields.printed_height_cm, fields.wall_thickness_cm,
             fields.unit_cost, fields.notes, fields.source_code, fields.resizable, id, orgId],
    });
  } catch (err) {
    const result = await db.execute({ sql: "SELECT * FROM carton_types WHERE id = ? AND org_id = ?", args: [id, orgId] });
    return renderForm(req, res, {
      title: "Edit Carton Type",
      carton: { ...result.rows[0], ...req.body },
      error: constraintMessage(err) ?? "Could not save changes. Please try again.",
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
