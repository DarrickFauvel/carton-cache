import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { ulid } from "../lib/id.js";

const router = Router();

router.get("/", requireRole("admin", "manager"), async (_req, res) => {
  const result = await db.execute(`
    SELECT at.*, ct.name AS carton_name, l.name AS location_name
    FROM alert_thresholds at
    JOIN carton_types ct ON ct.id = at.carton_type_id
    JOIN locations l ON l.id = at.location_id
    ORDER BY l.name, ct.name
  `);
  const [locations, cartons] = await Promise.all([
    db.execute("SELECT id, name FROM locations WHERE active = 1 ORDER BY name"),
    db.execute("SELECT id, name FROM carton_types ORDER BY name"),
  ]);
  res.render("pages/alerts/index", {
    title: "Alert Thresholds",
    thresholds: result.rows,
    locations: locations.rows,
    cartons: cartons.rows,
  });
});

router.post("/", requireRole("admin", "manager"), async (req, res) => {
  const { location_id, carton_type_id, condition, min_quantity } = req.body;
  await db.execute({
    sql: `
      INSERT INTO alert_thresholds (id, location_id, carton_type_id, condition, min_quantity)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (location_id, carton_type_id, condition)
      DO UPDATE SET min_quantity = excluded.min_quantity
    `,
    args: [ulid(), location_id as string, carton_type_id as string, (condition || "any") as string, parseInt(min_quantity as string, 10)],
  });
  res.redirect("/alerts");
});

router.post("/:id/delete", requireRole("admin", "manager"), async (req, res) => {
  await db.execute({
    sql: "DELETE FROM alert_thresholds WHERE id = ?",
    args: [req.params.id as string],
  });
  res.redirect("/alerts");
});

export default router;
