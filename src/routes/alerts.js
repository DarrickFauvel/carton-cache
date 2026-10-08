import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { LOCATION_LABEL_SQL, LOCATION_ORDER_SQL, PARENT_JOIN_SQL, locationOptions } from "../lib/locations.js";
import { ulid, str, defined } from "../lib/id.js";

const router = Router();

router.get("/", requireRole("admin", "manager"), async (req, res) => {
  const orgId = defined(req.session.orgId);
  const result = await db.execute({
    sql: `SELECT at.*, ct.name AS carton_name, ${LOCATION_LABEL_SQL} AS location_name
          FROM alert_thresholds at
          JOIN carton_types ct ON ct.id = at.carton_type_id
          JOIN locations l ON l.id = at.location_id
          ${PARENT_JOIN_SQL}
          WHERE at.org_id = ?
          ORDER BY ${LOCATION_ORDER_SQL}, ct.name`,
    args: [orgId],
  });
  const [locations, cartons] = await Promise.all([
    locationOptions(orgId),
    db.execute({ sql: "SELECT id, name FROM carton_types WHERE org_id = ? AND archived_at IS NULL ORDER BY name", args: [orgId] }),
  ]);
  res.render("pages/alerts/index", {
    title: "Alert Thresholds",
    thresholds: result.rows,
    locations,
    cartons: cartons.rows,
  });
});

router.post("/", requireRole("admin", "manager"), async (req, res) => {
  const { location_id, carton_type_id, condition, min_quantity } = req.body;
  await db.execute({
    sql: `INSERT INTO alert_thresholds (id, location_id, carton_type_id, condition, min_quantity, org_id)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (location_id, carton_type_id, condition)
          DO UPDATE SET min_quantity = excluded.min_quantity`,
    args: [ulid(), location_id, carton_type_id, condition || "any", parseInt(min_quantity, 10), defined(req.session.orgId)],
  });
  res.redirect("/alerts");
});

router.post("/:id/delete", requireRole("admin", "manager"), async (req, res) => {
  await db.execute({
    sql: "DELETE FROM alert_thresholds WHERE id = ? AND org_id = ?",
    args: [str(req.params.id), defined(req.session.orgId)],
  });
  res.redirect("/alerts");
});

export default router;
