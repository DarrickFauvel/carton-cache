import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { ulid, now, str, defined } from "../lib/id.js";

const router = Router();

/** @param {Record<string, string | string[]>} body */
function parseRetailCartonBody(body) {
  const store_name = str(body.store_name);
  const city       = str(body.city);
  const name       = str(body.name);
  const sku        = str(body.sku);
  const length_in  = str(body.length_in);
  const width_in   = str(body.width_in);
  const height_in  = str(body.height_in);
  const weight_lb  = str(body.weight_lb);
  const cost       = str(body.cost);
  const tax_percent = str(body.tax_percent);
  const notes      = str(body.notes);
  return {
    store_name: store_name.trim(),
    city:       city.trim() || null,
    name:       name.trim(),
    sku:        sku.trim()   || null,
    length_in:  length_in ? parseFloat(length_in) : null,
    width_in:   width_in  ? parseFloat(width_in)  : null,
    height_in:  height_in ? parseFloat(height_in) : null,
    weight_lb:  weight_lb ? parseFloat(weight_lb) : null,
    cost:       cost      ? parseFloat(cost)      : null,
    tax_percent: tax_percent ? parseFloat(tax_percent) : null,
    notes:      notes.trim() || null,
  };
}

/**
 * @param {unknown} err
 * @returns {string | null}
 */
function constraintMessage(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("UNIQUE")) return "An entry for that store and SKU already exists.";
  return null;
}

router.get("/", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: "SELECT * FROM retail_carton_options WHERE org_id = ? ORDER BY store_name, name",
    args: [defined(req.session.orgId)],
  });
  res.render("pages/retail-cartons/index", {
    title: "Retail Carton Options",
    options: result.rows,
    saved: false,
  });
});

router.get("/new", requireRole("admin", "manager"), async (req, res) => {
  const org = await db.execute({
    sql: "SELECT default_tax_percent FROM organizations WHERE id = ?",
    args: [defined(req.session.orgId)],
  });
  res.render("pages/retail-cartons/form", {
    title: "New Retail Carton Option",
    option: null,
    defaultTaxPercent: org.rows[0]?.default_tax_percent ?? null,
    error: null,
  });
});

router.post("/", requireRole("admin", "manager"), async (req, res) => {
  const fields = parseRetailCartonBody(req.body);
  const wantsJson = req.headers.accept?.includes("application/json") ?? false;

  if (!fields.store_name || !fields.name) {
    const error = "Store and name are required.";
    if (wantsJson) return res.status(400).json({ error });
    return res.render("pages/retail-cartons/form", {
      title: "New Retail Carton Option",
      option: req.body,
      error,
    });
  }

  const id = ulid();
  try {
    await db.execute({
      sql: `INSERT INTO retail_carton_options
              (id, store_name, city, name, sku, length_in, width_in, height_in, weight_lb, cost, tax_percent, notes, org_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, fields.store_name, fields.city, fields.name, fields.sku,
             fields.length_in, fields.width_in, fields.height_in,
             fields.weight_lb, fields.cost, fields.tax_percent, fields.notes,
             defined(req.session.orgId), now()],
    });
  } catch (err) {
    const error = constraintMessage(err) ?? "Could not save this entry. Please try again.";
    if (wantsJson) return res.status(409).json({ error });
    return res.render("pages/retail-cartons/form", {
      title: "New Retail Carton Option",
      option: req.body,
      error,
    });
  }

  if (wantsJson) return res.json({ id, store_name: fields.store_name, name: fields.name });
  res.redirect("/retail-cartons?saved=1");
});

router.get("/:id/edit", requireRole("admin", "manager"), async (req, res) => {
  const result = await db.execute({
    sql: "SELECT * FROM retail_carton_options WHERE id = ? AND org_id = ?",
    args: [str(req.params.id), defined(req.session.orgId)],
  });
  if (!result.rows[0]) return res.redirect("/retail-cartons");
  res.render("pages/retail-cartons/form", {
    title: "Edit Retail Carton Option",
    option: result.rows[0],
    error: null,
  });
});

router.post("/:id/edit", requireRole("admin", "manager"), async (req, res) => {
  const id = str(req.params.id);
  const orgId = defined(req.session.orgId);
  const fields = parseRetailCartonBody(req.body);

  if (!fields.store_name || !fields.name) {
    const result = await db.execute({ sql: "SELECT * FROM retail_carton_options WHERE id = ? AND org_id = ?", args: [id, orgId] });
    return res.render("pages/retail-cartons/form", {
      title: "Edit Retail Carton Option",
      option: { ...result.rows[0], ...req.body },
      error: "Store and name are required.",
    });
  }

  try {
    await db.execute({
      sql: `UPDATE retail_carton_options
            SET store_name=?, city=?, name=?, sku=?, length_in=?, width_in=?, height_in=?, weight_lb=?, cost=?, tax_percent=?, notes=?
            WHERE id=? AND org_id=?`,
      args: [fields.store_name, fields.city, fields.name, fields.sku,
             fields.length_in, fields.width_in, fields.height_in,
             fields.weight_lb, fields.cost, fields.tax_percent, fields.notes, id, orgId],
    });
  } catch (err) {
    const result = await db.execute({ sql: "SELECT * FROM retail_carton_options WHERE id = ? AND org_id = ?", args: [id, orgId] });
    return res.render("pages/retail-cartons/form", {
      title: "Edit Retail Carton Option",
      option: { ...result.rows[0], ...req.body },
      error: constraintMessage(err) ?? "Could not save changes. Please try again.",
    });
  }

  res.redirect("/retail-cartons?saved=1");
});

router.post("/:id/delete", requireRole("admin", "manager"), async (req, res) => {
  const id = str(req.params.id);
  const orgId = defined(req.session.orgId);
  await db.execute({ sql: "DELETE FROM retail_carton_options WHERE id = ? AND org_id = ?", args: [id, orgId] });
  res.redirect("/retail-cartons?saved=1");
});

export default router;
