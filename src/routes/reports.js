import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { defined } from "../lib/id.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const { from, to, location } = req.query;
  const orgId = defined(req.session.orgId);

  const fromMs = from ? new Date(/** @type {string} */ (from)).getTime() : Date.now() - 30 * 86400000;
  const toMs   = to   ? new Date(/** @type {string} */ (to)).getTime() + 86400000 : Date.now();

  const stockValue = await db.execute({
    sql: `SELECT ct.name, il.condition, il.quantity, il.location_id,
                 ct.unit_cost, il.quantity * ct.unit_cost AS value
          FROM inventory_lots il
          JOIN carton_types ct ON ct.id = il.carton_type_id
          WHERE ct.unit_cost IS NOT NULL AND il.org_id = ?
          ORDER BY ct.name`,
    args: [orgId],
  });

  const reuseSavings = await db.execute({
    sql: `SELECT ct.name, t.condition, SUM(t.quantity) AS qty,
                 ct.unit_cost, SUM(t.quantity) * ct.unit_cost AS savings
          FROM transactions t
          JOIN carton_types ct ON ct.id = t.carton_type_id
          WHERE t.type = 'receive'
            AND t.condition != 'new'
            AND ct.unit_cost IS NOT NULL
            AND t.org_id = ?
            AND t.created_at BETWEEN ? AND ?
          GROUP BY t.carton_type_id, t.condition
          ORDER BY savings DESC`,
    args: [orgId, fromMs, toMs],
  });

  const spend = await db.execute({
    sql: `SELECT ct.name, SUM(t.quantity) AS qty,
                 SUM(t.quantity * COALESCE(t.unit_cost_snapshot, ct.unit_cost, 0)) AS total_cost
          FROM transactions t
          JOIN carton_types ct ON ct.id = t.carton_type_id
          WHERE t.type = 'receive'
            AND t.condition = 'new'
            AND t.org_id = ?
            AND t.created_at BETWEEN ? AND ?
          GROUP BY t.carton_type_id
          ORDER BY total_cost DESC`,
    args: [orgId, fromMs, toMs],
  });

  const consumption = await db.execute({
    sql: `SELECT ct.name,
                 strftime('%Y-W%W', datetime(t.created_at / 1000, 'unixepoch')) AS week,
                 SUM(t.quantity) AS qty
          FROM transactions t
          JOIN carton_types ct ON ct.id = t.carton_type_id
          WHERE t.type = 'consume'
            AND t.org_id = ?
            AND t.created_at >= ?
          GROUP BY t.carton_type_id, week
          ORDER BY week, ct.name`,
    args: [orgId, Date.now() - 84 * 86400000],
  });

  res.render("pages/reports/index", {
    title: "Reports",
    stockValue: stockValue.rows,
    reuseSavings: reuseSavings.rows,
    spend: spend.rows,
    consumption: consumption.rows,
    filters: { from, to, location },
    fromMs,
    toMs,
  });
});

// CSV export of current stock snapshot
router.get("/snapshot.csv", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: `SELECT l.name AS location, ct.name AS carton, ct.sku, il.condition, il.quantity
          FROM inventory_lots il
          JOIN carton_types ct ON ct.id = il.carton_type_id
          JOIN locations l ON l.id = il.location_id
          WHERE il.org_id = ?
          ORDER BY l.name, ct.name, il.condition`,
    args: [defined(req.session.orgId)],
  });

  const header = "Location,Carton,SKU,Condition,Quantity\n";
  const rows = result.rows
    .map((r) => `"${r.location}","${r.carton}","${r.sku ?? ""}","${r.condition}",${r.quantity}`)
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="carton-snapshot-${Date.now()}.csv"`);
  res.send(header + rows);
});

export default router;
