import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { ulid, now } from "../lib/id.js";

const router = Router();

router.get("/", requireAuth, async (_req, res) => {
  const result = await db.execute(
    "SELECT * FROM carton_types ORDER BY name"
  );
  res.render("pages/cartons/index", {
    title: "Carton Types",
    cartons: result.rows,
  });
});

router.get("/new", requireRole("admin", "manager"), (_req, res) => {
  res.render("pages/cartons/form", { title: "New Carton Type", carton: null });
});

router.post("/", requireRole("admin", "manager"), async (req, res) => {
  const { name, sku, barcode, length_cm, width_cm, height_cm, unit_cost, notes } = req.body;
  await db.execute({
    sql: `INSERT INTO carton_types (id, name, sku, barcode, length_cm, width_cm, height_cm, unit_cost, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      ulid(), name,
      sku || null, barcode || null,
      length_cm ? parseFloat(length_cm) : null,
      width_cm  ? parseFloat(width_cm)  : null,
      height_cm ? parseFloat(height_cm) : null,
      unit_cost ? parseFloat(unit_cost) : null,
      notes || null,
      now(),
    ],
  });
  res.redirect("/cartons");
});

router.get("/:id/edit", requireRole("admin", "manager"), async (req, res) => {
  const result = await db.execute({
    sql: "SELECT * FROM carton_types WHERE id = ?",
    args: [req.params.id as string],
  });
  if (!result.rows[0]) { res.redirect("/cartons"); return; }
  res.render("pages/cartons/form", {
    title: "Edit Carton Type",
    carton: result.rows[0],
  });
});

router.post("/:id", requireRole("admin", "manager"), async (req, res) => {
  const { name, sku, barcode, length_cm, width_cm, height_cm, unit_cost, notes } = req.body;
  await db.execute({
    sql: `UPDATE carton_types SET name=?, sku=?, barcode=?, length_cm=?, width_cm=?, height_cm=?, unit_cost=?, notes=?
          WHERE id=?`,
    args: [
      name,
      sku || null, barcode || null,
      length_cm ? parseFloat(length_cm) : null,
      width_cm  ? parseFloat(width_cm)  : null,
      height_cm ? parseFloat(height_cm) : null,
      unit_cost ? parseFloat(unit_cost) : null,
      notes || null,
      req.params.id,
    ],
  });
  res.redirect("/cartons");
});

export default router;
