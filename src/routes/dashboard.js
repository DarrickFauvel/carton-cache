import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { defined } from "../lib/id.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const { userRole } = req.session;
  const orgId = defined(req.session.orgId);
  const userLocationIds = defined(req.session.userLocationIds);

  const canSeeAll = userRole === "admin" || userRole === "manager";

  const locationResult = await db.execute(
    canSeeAll
      ? { sql: "SELECT * FROM locations WHERE active = 1 AND org_id = ? ORDER BY name", args: [orgId] }
      : {
          sql: `SELECT * FROM locations WHERE active = 1 AND org_id = ? AND id IN (${userLocationIds.map(() => "?").join(",")}) ORDER BY name`,
          args: [orgId, ...userLocationIds],
        }
  );

  const lotResult = await db.execute({
    sql: `
      SELECT
        il.id, il.location_id, il.carton_type_id, il.condition, il.quantity, il.updated_at,
        ct.name AS carton_name, ct.sku, ct.unit_cost,
        l.name AS location_name
      FROM inventory_lots il
      JOIN carton_types ct ON ct.id = il.carton_type_id
      JOIN locations l ON l.id = il.location_id
      WHERE il.quantity > 0 AND il.org_id = ?
      ORDER BY l.name, ct.name, il.condition
    `,
    args: [orgId],
  });

  const thresholdResult = await db.execute({
    sql: "SELECT location_id, carton_type_id, condition, min_quantity FROM alert_thresholds WHERE org_id = ?",
    args: [orgId],
  });

  res.render("pages/dashboard", {
    title: "Dashboard",
    locations: locationResult.rows,
    lots: lotResult.rows,
    thresholds: thresholdResult.rows,
  });
});

export default router;
