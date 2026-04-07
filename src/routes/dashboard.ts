import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/client.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const { userRole, userLocationIds } = req.session;

  // Admins and managers see all locations; staff see only their assigned ones
  const canSeeAll = userRole === "admin" || userRole === "manager";

  const locationResult = await db.execute(
    canSeeAll
      ? "SELECT * FROM locations WHERE active = 1 ORDER BY name"
      : {
          sql: `SELECT * FROM locations WHERE active = 1 AND id IN (${userLocationIds!.map(() => "?").join(",")}) ORDER BY name`,
          args: userLocationIds!,
        }
  );

  // Load inventory lots with carton type info
  const lotResult = await db.execute(`
    SELECT
      il.id, il.location_id, il.carton_type_id, il.condition, il.quantity, il.updated_at,
      ct.name AS carton_name, ct.sku, ct.unit_cost,
      l.name AS location_name
    FROM inventory_lots il
    JOIN carton_types ct ON ct.id = il.carton_type_id
    JOIN locations l ON l.id = il.location_id
    WHERE il.quantity > 0
    ORDER BY l.name, ct.name, il.condition
  `);

  // Load active alert thresholds to flag low stock
  const thresholdResult = await db.execute(`
    SELECT location_id, carton_type_id, condition, min_quantity
    FROM alert_thresholds
  `);

  res.render("pages/dashboard", {
    title: "Dashboard",
    locations: locationResult.rows,
    lots: lotResult.rows,
    thresholds: thresholdResult.rows,
  });
});

export default router;
