import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { ulid, now, str } from "../lib/id.js";

const router = Router();

const FORM_SCRIPTS = ["barcode-scanner"];

function parseCartonBody(body: Record<string, string | string[]>) {
  const name      = str(body.name);
  const sku       = str(body.sku);
  const barcode   = str(body.barcode);
  const length_cm = str(body.length_cm);
  const width_cm  = str(body.width_cm);
  const height_cm = str(body.height_cm);
  const unit_cost = str(body.unit_cost);
  const notes     = str(body.notes);
  return {
    name:      name.trim(),
    sku:       sku.trim()       || null,
    barcode:   barcode.trim()   || null,
    length_cm: length_cm ? parseFloat(length_cm) : null,
    width_cm:  width_cm  ? parseFloat(width_cm)  : null,
    height_cm: height_cm ? parseFloat(height_cm) : null,
    unit_cost: unit_cost ? parseFloat(unit_cost) : null,
    notes:     notes.trim()     || null,
  };
}

function constraintMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("UNIQUE") && msg.includes("sku")) return "A carton type with that SKU already exists.";
  if (msg.includes("UNIQUE") && msg.includes("barcode")) return "A carton type with that barcode already exists.";
  return null;
}

router.get("/lookup", requireAuth, async (req, res) => {
  const barcode = String(req.query.barcode ?? "").trim();
  if (!barcode) return res.status(400).json({ error: "barcode required" });
  const result = await db.execute({
    sql: "SELECT id, name, sku FROM carton_types WHERE barcode = ?",
    args: [barcode],
  });
  if (!result.rows[0]) return res.status(404).json({ error: "No carton with that barcode." });
  res.json(result.rows[0]);
});

router.get("/", requireAuth, async (_req, res) => {
  const result = await db.execute("SELECT * FROM carton_types ORDER BY name");
  res.render("pages/cartons/index", {
    title: "Carton Types",
    cartons: result.rows,
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
      sql: `INSERT INTO carton_types (id, name, sku, barcode, length_cm, width_cm, height_cm, unit_cost, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, fields.name, fields.sku, fields.barcode,
             fields.length_cm, fields.width_cm, fields.height_cm,
             fields.unit_cost, fields.notes, now()],
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
    sql: "SELECT * FROM carton_types WHERE id = ?",
    args: [str(req.params.id)],
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
  const fields = parseCartonBody(req.body);
  if (!fields.name) {
    const result = await db.execute({ sql: "SELECT * FROM carton_types WHERE id = ?", args: [id] });
    return res.render("pages/cartons/form", {
      title: "Edit Carton Type",
      carton: { ...result.rows[0], ...req.body },
      error: "Name is required.",
      componentScripts: FORM_SCRIPTS,
    });
  }
  try {
    await db.execute({
      sql: `UPDATE carton_types SET name=?, sku=?, barcode=?, length_cm=?, width_cm=?, height_cm=?, unit_cost=?, notes=?
            WHERE id=?`,
      args: [fields.name, fields.sku, fields.barcode,
             fields.length_cm, fields.width_cm, fields.height_cm,
             fields.unit_cost, fields.notes, id],
    });
  } catch (err) {
    const result = await db.execute({ sql: "SELECT * FROM carton_types WHERE id = ?", args: [id] });
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
  const [txCount, lotCount] = await Promise.all([
    db.execute({ sql: "SELECT COUNT(*) AS n FROM transactions WHERE carton_type_id = ?", args: [id] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM inventory_lots WHERE carton_type_id = ? AND quantity > 0", args: [id] }),
  ]);

  if (Number(txCount.rows[0]?.n) > 0 || Number(lotCount.rows[0]?.n) > 0) {
    const result = await db.execute("SELECT * FROM carton_types ORDER BY name");
    return res.render("pages/cartons/index", {
      title: "Carton Types",
      cartons: result.rows,
      saved: false,
      deleteError: "Cannot delete a carton type that has transactions or stock on hand.",
    });
  }

  await db.execute({ sql: "DELETE FROM carton_types WHERE id = ?", args: [id] });
  res.redirect("/cartons?saved=1");
});

export default router;
