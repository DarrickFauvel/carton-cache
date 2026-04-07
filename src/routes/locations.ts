import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { ulid, now } from "../lib/id.js";

const router = Router();

router.get("/", requireRole("admin", "manager"), async (_req, res) => {
  const result = await db.execute("SELECT * FROM locations ORDER BY name");
  res.render("pages/locations/index", {
    title: "Locations",
    locations: result.rows,
  });
});

router.get("/new", requireRole("admin"), (_req, res) => {
  res.render("pages/locations/form", { title: "New Location", location: null });
});

router.post("/", requireRole("admin"), async (req, res) => {
  const { name, address } = req.body;
  await db.execute({
    sql: "INSERT INTO locations (id, name, address, active, created_at) VALUES (?, ?, ?, 1, ?)",
    args: [ulid(), name, address || null, now()],
  });
  res.redirect("/locations");
});

router.get("/:id", requireRole("admin", "manager"), async (req, res) => {
  const [locResult, lotResult] = await Promise.all([
    db.execute({ sql: "SELECT * FROM locations WHERE id = ?", args: [req.params.id as string] }),
    db.execute({
      sql: `SELECT il.*, ct.name AS carton_name, ct.unit_cost
            FROM inventory_lots il
            JOIN carton_types ct ON ct.id = il.carton_type_id
            WHERE il.location_id = ?
            ORDER BY ct.name, il.condition`,
      args: [req.params.id as string],
    }),
  ]);
  if (!locResult.rows[0]) { res.redirect("/locations"); return; }
  res.render("pages/locations/detail", {
    title: locResult.rows[0].name as string,
    location: locResult.rows[0],
    lots: lotResult.rows,
  });
});

router.get("/:id/edit", requireRole("admin"), async (req, res) => {
  const result = await db.execute({
    sql: "SELECT * FROM locations WHERE id = ?",
    args: [req.params.id as string],
  });
  if (!result.rows[0]) { res.redirect("/locations"); return; }
  res.render("pages/locations/form", {
    title: "Edit Location",
    location: result.rows[0],
  });
});

router.post("/:id", requireRole("admin"), async (req, res) => {
  const { name, address, active } = req.body;
  await db.execute({
    sql: "UPDATE locations SET name=?, address=?, active=? WHERE id=?",
    args: [name, address || null, active === "1" ? 1 : 0, req.params.id],
  });
  res.redirect("/locations");
});

export default router;
