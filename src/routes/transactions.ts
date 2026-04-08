import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import * as inventory from "../services/inventory.js";
import type { Condition } from "../types.js";

const router = Router();

// ── Receive ───────────────────────────────────────────────────────────────────

router.get("/receive", requireAuth, async (req, res) => {
  const [locations, cartons] = await Promise.all([
    db.execute("SELECT id, name FROM locations WHERE active = 1 ORDER BY name"),
    db.execute("SELECT id, name, sku, barcode, unit_cost FROM carton_types ORDER BY name"),
  ]);
  const role = req.session.userRole;
  res.render("pages/transactions/receive", {
    title: "Receive Stock",
    locations: locations.rows,
    cartons: cartons.rows,
    canCreateLocation: role === "admin",
    canCreateCarton: role === "admin" || role === "manager",
    componentScripts: ["barcode-scanner", "quick-create", "carton-scanner"],
  });
});

router.post("/receive", requireAuth, async (req, res) => {
  const { location_id, carton_type_id, condition, quantity, unit_cost, notes } = req.body;
  await inventory.receive({
    locationId: location_id,
    cartonTypeId: carton_type_id,
    condition: condition as Condition,
    quantity: parseInt(quantity, 10),
    unitCostOverride: unit_cost ? parseFloat(unit_cost) : undefined,
    userId: req.session.userId!,
    notes,
  });
  res.redirect("/");
});

// ── Consume ───────────────────────────────────────────────────────────────────

router.get("/consume", requireAuth, async (req, res) => {
  const [locations, cartons] = await Promise.all([
    db.execute("SELECT id, name FROM locations WHERE active = 1 ORDER BY name"),
    db.execute("SELECT id, name, sku, barcode FROM carton_types ORDER BY name"),
  ]);
  res.render("pages/transactions/consume", {
    title: "Consume Stock",
    locations: locations.rows,
    cartons: cartons.rows,
    componentScripts: ["barcode-scanner", "carton-scanner"],
  });
});

router.post("/consume", requireAuth, async (req, res) => {
  const { location_id, carton_type_id, condition, quantity, notes } = req.body;
  await inventory.consume({
    locationId: location_id,
    cartonTypeId: carton_type_id,
    condition: condition as Condition,
    quantity: parseInt(quantity, 10),
    userId: req.session.userId!,
    notes,
  });
  res.redirect("/");
});

// ── Transfer ──────────────────────────────────────────────────────────────────

router.get("/transfer", requireAuth, async (req, res) => {
  const [locations, cartons] = await Promise.all([
    db.execute("SELECT id, name FROM locations WHERE active = 1 ORDER BY name"),
    db.execute("SELECT id, name, sku, barcode FROM carton_types ORDER BY name"),
  ]);
  res.render("pages/transactions/transfer", {
    title: "Transfer Stock",
    locations: locations.rows,
    cartons: cartons.rows,
  });
});

router.post("/transfer", requireAuth, async (req, res) => {
  const { from_location_id, to_location_id, carton_type_id, condition, quantity, notes } = req.body;
  await inventory.transfer({
    fromLocationId: from_location_id,
    toLocationId: to_location_id,
    cartonTypeId: carton_type_id,
    condition: condition as Condition,
    quantity: parseInt(quantity, 10),
    userId: req.session.userId!,
    notes,
  });
  res.redirect("/");
});

// ── Adjustment ────────────────────────────────────────────────────────────────

router.get("/adjust", requireRole("admin", "manager"), async (req, res) => {
  const [locations, cartons] = await Promise.all([
    db.execute("SELECT id, name FROM locations WHERE active = 1 ORDER BY name"),
    db.execute("SELECT id, name, sku FROM carton_types ORDER BY name"),
  ]);
  res.render("pages/transactions/adjust", {
    title: "Adjust Stock",
    locations: locations.rows,
    cartons: cartons.rows,
  });
});

router.post("/adjust", requireRole("admin", "manager"), async (req, res) => {
  const { location_id, carton_type_id, condition, new_quantity, notes } = req.body;
  await inventory.adjust({
    locationId: location_id,
    cartonTypeId: carton_type_id,
    condition: condition as Condition,
    newQuantity: parseInt(new_quantity, 10),
    userId: req.session.userId!,
    notes,
  });
  res.redirect("/");
});

// ── History ───────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const { location, type, carton, from, to } = req.query;

  let sql = `
    SELECT t.*, ct.name AS carton_name, l.name AS location_name, u.name AS user_name
    FROM transactions t
    JOIN carton_types ct ON ct.id = t.carton_type_id
    JOIN locations l ON l.id = t.location_id
    JOIN users u ON u.id = t.user_id
    WHERE 1=1
  `;
  const args: (string | number)[] = [];

  if (location) { sql += " AND t.location_id = ?"; args.push(location as string); }
  if (type)     { sql += " AND t.type = ?"; args.push(type as string); }
  if (carton)   { sql += " AND t.carton_type_id = ?"; args.push(carton as string); }
  if (from)     { sql += " AND t.created_at >= ?"; args.push(new Date(from as string).getTime()); }
  if (to)       { sql += " AND t.created_at <= ?"; args.push(new Date(to as string).getTime() + 86400000); }

  sql += " ORDER BY t.created_at DESC LIMIT 200";

  const [txResult, locations, cartons] = await Promise.all([
    db.execute({ sql, args }),
    db.execute("SELECT id, name FROM locations ORDER BY name"),
    db.execute("SELECT id, name FROM carton_types ORDER BY name"),
  ]);

  res.render("pages/transactions/history", {
    title: "Transaction History",
    transactions: txResult.rows,
    locations: locations.rows,
    cartons: cartons.rows,
    filters: { location, type, carton, from, to },
  });
});

export default router;
