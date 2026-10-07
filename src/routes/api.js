/**
 * JSON API for non-browser-page clients (the Chrome extension in
 * extension/). Same session-cookie auth as the HTML app, but every
 * response — including auth failures, 404s and errors — is JSON.
 */

import { Router } from "express";
import { requireApiAuth, requireApiRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import * as inventory from "../services/inventory.js";
import * as cartonSuggest from "../services/carton-suggest.js";
import { defined } from "../lib/id.js";

/** @typedef {import("../types.js").Condition} Condition */

const router = Router();

/** @type {readonly Condition[]} */
const CONDITIONS = ["new", "good", "fair", "poor"];

router.get("/me", requireApiAuth, (req, res) => {
  res.json({
    name: req.session.userName,
    role: req.session.userRole,
    orgName: req.session.orgName,
  });
});

router.get("/locations", requireApiAuth, async (req, res) => {
  const { userRole } = req.session;
  const orgId = defined(req.session.orgId);
  const userLocationIds = defined(req.session.userLocationIds);

  if (userRole === "admin" || userRole === "manager") {
    const result = await db.execute({
      sql: "SELECT id, name FROM locations WHERE active = 1 AND org_id = ? ORDER BY name",
      args: [orgId],
    });
    return res.json(result.rows);
  }
  if (userLocationIds.length === 0) return res.json([]);
  const result = await db.execute({
    sql: `SELECT id, name FROM locations WHERE active = 1 AND org_id = ? AND id IN (${userLocationIds.map(() => "?").join(",")}) ORDER BY name`,
    args: [orgId, ...userLocationIds],
  });
  res.json(result.rows);
});

router.get("/cartons/suggest", requireApiAuth, async (req, res) => {
  const parsed = cartonSuggest.parseSuggestQuery(req.query, defined(req.session.orgId));
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });
  res.json(await cartonSuggest.suggest(parsed.args));
});

router.post("/transactions/consume", requireApiRole("admin", "manager", "staff"), async (req, res) => {
  const orgId = defined(req.session.orgId);
  const body = req.body ?? {};
  const locationId = typeof body.location_id === "string" ? body.location_id : "";
  const cartonTypeId = typeof body.carton_type_id === "string" ? body.carton_type_id : "";
  const condition = /** @type {Condition} */ (body.condition);
  const quantity = body.quantity;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : undefined;

  if (!CONDITIONS.includes(condition)) {
    return res.status(400).json({ error: `condition must be one of: ${CONDITIONS.join(", ")}.` });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: "quantity must be a positive integer." });
  }

  const [location, carton] = await Promise.all([
    db.execute({ sql: "SELECT id FROM locations WHERE id = ? AND org_id = ? AND active = 1", args: [locationId, orgId] }),
    db.execute({ sql: "SELECT id FROM carton_types WHERE id = ? AND org_id = ?", args: [cartonTypeId, orgId] }),
  ]);
  const role = req.session.userRole;
  const canUseLocation =
    location.rows.length > 0 &&
    (role === "admin" || role === "manager" || defined(req.session.userLocationIds).includes(locationId));
  if (!canUseLocation) return res.status(400).json({ error: "Unknown location." });
  if (carton.rows.length === 0) return res.status(400).json({ error: "Unknown carton type." });

  const transactionId = await inventory.consume({
    orgId,
    locationId,
    cartonTypeId,
    condition,
    quantity,
    userId: defined(req.session.userId),
    notes,
  });
  res.status(201).json({ transaction_id: transactionId });
});

router.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

router.use(
  /**
   * @param {Error} err
   * @param {import("express").Request} _req
   * @param {import("express").Response} res
   * @param {import("express").NextFunction} _next
   */
  (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({
      error: process.env.NODE_ENV === "production" ? "Something went wrong." : err.message,
    });
  }
);

export default router;
