import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import * as inventory from "../services/inventory.js";
import { str, defined } from "../lib/id.js";

/** @typedef {import("../types.js").Condition} Condition */

const router = Router();

// ── Receive ───────────────────────────────────────────────────────────────────

router.get("/receive", requireAuth, async (req, res) => {
  const orgId = defined(req.session.orgId);
  const { userRole } = req.session;
  const [locations, cartons] = await Promise.all([
    db.execute({ sql: "SELECT id, name FROM locations WHERE active = 1 AND org_id = ? ORDER BY name", args: [orgId] }),
    db.execute({ sql: "SELECT id, name, sku, barcode, unit_cost FROM carton_types WHERE org_id = ? ORDER BY name", args: [orgId] }),
  ]);
  res.render("pages/transactions/receive", {
    title: "Receive Stock",
    locations: locations.rows,
    cartons: cartons.rows,
    canCreateLocation: userRole === "admin",
    canCreateCarton: userRole === "admin" || userRole === "manager",
    componentScripts: ["barcode-scanner", "quick-create", "carton-scanner"],
  });
});

router.post("/receive", requireAuth, async (req, res) => {
  const { location_id, carton_type_id, condition, quantity, unit_cost, notes } = req.body;
  await inventory.receive({
    orgId: defined(req.session.orgId),
    locationId: str(location_id),
    cartonTypeId: str(carton_type_id),
    condition: /** @type {Condition} */ (str(condition)),
    quantity: parseInt(str(quantity), 10),
    unitCostOverride: unit_cost ? parseFloat(str(unit_cost)) : undefined,
    userId: defined(req.session.userId),
    notes: str(notes) || undefined,
  });
  res.redirect("/");
});

// ── Consume ───────────────────────────────────────────────────────────────────

router.get("/consume", requireAuth, async (req, res) => {
  const orgId = defined(req.session.orgId);
  const [locations, cartons] = await Promise.all([
    db.execute({ sql: "SELECT id, name FROM locations WHERE active = 1 AND org_id = ? ORDER BY name", args: [orgId] }),
    db.execute({ sql: "SELECT id, name, sku, barcode FROM carton_types WHERE org_id = ? ORDER BY name", args: [orgId] }),
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
    orgId: defined(req.session.orgId),
    locationId: str(location_id),
    cartonTypeId: str(carton_type_id),
    condition: /** @type {Condition} */ (str(condition)),
    quantity: parseInt(str(quantity), 10),
    userId: defined(req.session.userId),
    notes: str(notes) || undefined,
  });
  res.redirect("/");
});

// ── Transfer ──────────────────────────────────────────────────────────────────

router.get("/transfer", requireAuth, async (req, res) => {
  const orgId = defined(req.session.orgId);
  const [locations, cartons] = await Promise.all([
    db.execute({ sql: "SELECT id, name FROM locations WHERE active = 1 AND org_id = ? ORDER BY name", args: [orgId] }),
    db.execute({ sql: "SELECT id, name, sku, barcode FROM carton_types WHERE org_id = ? ORDER BY name", args: [orgId] }),
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
    orgId: defined(req.session.orgId),
    fromLocationId: str(from_location_id),
    toLocationId: str(to_location_id),
    cartonTypeId: str(carton_type_id),
    condition: /** @type {Condition} */ (str(condition)),
    quantity: parseInt(str(quantity), 10),
    userId: defined(req.session.userId),
    notes: str(notes) || undefined,
  });
  res.redirect("/");
});

// ── Adjustment ────────────────────────────────────────────────────────────────

router.get("/adjust", requireRole("admin", "manager"), async (req, res) => {
  const orgId = defined(req.session.orgId);
  const [locations, cartons] = await Promise.all([
    db.execute({ sql: "SELECT id, name FROM locations WHERE active = 1 AND org_id = ? ORDER BY name", args: [orgId] }),
    db.execute({ sql: "SELECT id, name, sku FROM carton_types WHERE org_id = ? ORDER BY name", args: [orgId] }),
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
    orgId: defined(req.session.orgId),
    locationId: str(location_id),
    cartonTypeId: str(carton_type_id),
    condition: /** @type {Condition} */ (str(condition)),
    newQuantity: parseInt(str(new_quantity), 10),
    userId: defined(req.session.userId),
    notes: str(notes),
  });
  res.redirect("/");
});

// ── History ───────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const orgId = defined(req.session.orgId);
  const { location, type, carton, from, to } = req.query;

  let sql = `
    SELECT t.*, ct.name AS carton_name, l.name AS location_name, u.name AS user_name
    FROM transactions t
    JOIN carton_types ct ON ct.id = t.carton_type_id
    JOIN locations l ON l.id = t.location_id
    JOIN users u ON u.id = t.user_id
    WHERE t.org_id = ?
  `;
  /** @type {(string | number)[]} */
  const args = [orgId];

  if (location) { sql += " AND t.location_id = ?"; args.push(/** @type {string} */ (location)); }
  if (type)     { sql += " AND t.type = ?"; args.push(/** @type {string} */ (type)); }
  if (carton)   { sql += " AND t.carton_type_id = ?"; args.push(/** @type {string} */ (carton)); }
  if (from)     { sql += " AND t.created_at >= ?"; args.push(new Date(/** @type {string} */ (from)).getTime()); }
  if (to)       { sql += " AND t.created_at <= ?"; args.push(new Date(/** @type {string} */ (to)).getTime() + 86400000); }

  sql += " ORDER BY t.created_at DESC LIMIT 200";

  const [txResult, locations, cartons] = await Promise.all([
    db.execute({ sql, args }),
    db.execute({ sql: "SELECT id, name FROM locations WHERE org_id = ? ORDER BY name", args: [orgId] }),
    db.execute({ sql: "SELECT id, name FROM carton_types WHERE org_id = ? ORDER BY name", args: [orgId] }),
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
