import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { ulid, now, str } from "../lib/id.js";

const router = Router();

router.get("/", requireRole("admin", "manager"), async (req, res) => {
  const result = await db.execute("SELECT * FROM locations ORDER BY name");
  res.render("pages/locations/index", {
    title: "Locations",
    locations: result.rows,
    saved: req.query.saved === "1",
  });
});

router.get("/new", requireRole("admin"), (_req, res) => {
  res.render("pages/locations/form", { title: "New Location", location: null, error: null });
});

router.post("/", requireRole("admin"), async (req, res) => {
  const name = str(req.body.name).trim();
  const address = str(req.body.address).trim() || null;
  const wantsJson = req.headers.accept?.includes("application/json") ?? false;

  if (!name) {
    if (wantsJson) return res.status(400).json({ error: "Name is required." });
    return res.render("pages/locations/form", {
      title: "New Location",
      location: req.body,
      error: "Name is required.",
    });
  }

  const id = ulid();
  try {
    await db.execute({
      sql: "INSERT INTO locations (id, name, address, active, created_at) VALUES (?, ?, ?, 1, ?)",
      args: [id, name, address, now()],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const error = msg.includes("UNIQUE") ? "A location with that name already exists." : "Could not save location.";
    if (wantsJson) return res.status(409).json({ error });
    return res.render("pages/locations/form", {
      title: "New Location",
      location: req.body,
      error,
    });
  }

  if (wantsJson) return res.json({ id, name });
  res.redirect("/locations?saved=1");
});

router.get("/:id", requireRole("admin", "manager"), async (req, res) => {
  const id = str(req.params.id);
  const [locResult, lotResult] = await Promise.all([
    db.execute({ sql: "SELECT * FROM locations WHERE id = ?", args: [id] }),
    db.execute({
      sql: `SELECT il.*, ct.name AS carton_name, ct.unit_cost
            FROM inventory_lots il
            JOIN carton_types ct ON ct.id = il.carton_type_id
            WHERE il.location_id = ?
            ORDER BY ct.name, il.condition`,
      args: [id],
    }),
  ]);
  if (!locResult.rows[0]) return res.redirect("/locations");
  res.render("pages/locations/detail", {
    title: locResult.rows[0].name as string,
    location: locResult.rows[0],
    lots: lotResult.rows,
  });
});

router.get("/:id/edit", requireRole("admin"), async (req, res) => {
  const result = await db.execute({ sql: "SELECT * FROM locations WHERE id = ?", args: [str(req.params.id)] });
  if (!result.rows[0]) return res.redirect("/locations");
  res.render("pages/locations/form", {
    title: "Edit Location",
    location: result.rows[0],
    error: null,
  });
});

router.post("/:id/edit", requireRole("admin"), async (req, res) => {
  const id = str(req.params.id);
  const name = str(req.body.name).trim();
  const address = str(req.body.address).trim() || null;
  const active = str(req.body.active) === "1" ? 1 : 0;

  if (!name) {
    const result = await db.execute({ sql: "SELECT * FROM locations WHERE id = ?", args: [id] });
    return res.render("pages/locations/form", {
      title: "Edit Location",
      location: { ...result.rows[0], ...req.body },
      error: "Name is required.",
    });
  }
  try {
    await db.execute({
      sql: "UPDATE locations SET name=?, address=?, active=? WHERE id=?",
      args: [name, address, active, id],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const result = await db.execute({ sql: "SELECT * FROM locations WHERE id = ?", args: [id] });
    return res.render("pages/locations/form", {
      title: "Edit Location",
      location: { ...result.rows[0], ...req.body },
      error: msg.includes("UNIQUE") ? "A location with that name already exists." : "Could not save changes.",
    });
  }
  res.redirect("/locations?saved=1");
});

export default router;
