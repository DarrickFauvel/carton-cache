import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { ulid, now, str, defined } from "../lib/id.js";
import { LOCATION_LABEL_SQL, LOCATION_ORDER_SQL, PARENT_JOIN_SQL, checkParent, locationSaveError, parentOptions } from "../lib/locations.js";
import { buildLabelCode } from "../lib/labels.js";
import { compareSizeCm } from "../lib/units.js";

/** @typedef {import("../types.js").Condition} Condition */
/** @typedef {import("../types.js").CartonType} CartonType */

const router = Router();

/** Slices drawn per carton type before the rest collapse into "+N". */
const STACK_SLICE_CAP = 20;

/** @type {readonly Condition[]} */
const CONDITIONS = ["new", "good", "fair", "poor"];

/**
 * One carton type in the stack view.
 * @typedef {object} StackGroup
 * @property {string} label label code, else the carton type's name
 * @property {number} total
 * @property {{ condition: Condition; heightPct: number }[]} slices at most STACK_SLICE_CAP
 * @property {number} more cartons beyond the cap
 * @property {boolean} noSize no dimensions, so drawn at a placeholder height
 */

/**
 * Draws a location's stock as flattened cartons standing on edge, like files:
 * one thin slice per carton, grouped by carton type, smallest first (the
 * dashboard's order). A regular slotted carton flattens to about (L + W) by
 * (H + W); stood on its long edge it's as tall as the shorter of the two.
 * Heights are a percentage of the stack's tallest carton.
 * @param {import("@libsql/client").Row[]} lots with carton_type_id, condition, quantity and the carton type's dimension and source columns
 * @returns {StackGroup[]}
 */
function buildStack(lots) {
  /** @param {unknown[]} d @returns {[number, number, number] | null} */
  const dims = (d) => (d.every((x) => x != null) ? [Number(d[0]), Number(d[1]), Number(d[2])] : null);
  /** @type {Map<string, { label: string; inside: [number, number, number] | null; size: [number, number, number] | null; byCondition: Map<Condition, number> }>} */
  const types = new Map();
  for (const lot of lots) {
    const quantity = Number(lot.quantity);
    if (quantity <= 0) continue;
    const id = String(lot.carton_type_id);
    let type = types.get(id);
    if (!type) {
      const printed = dims([lot.printed_length_cm, lot.printed_width_cm, lot.printed_height_cm]);
      const inside = dims([lot.length_cm, lot.width_cm, lot.height_cm]);
      type = {
        label: buildLabelCode(/** @type {CartonType} */ (/** @type {unknown} */ (lot))) ?? String(lot.carton_name),
        inside: inside ?? printed,
        size: printed ?? inside,
        byCondition: new Map(),
      };
      types.set(id, type);
    }
    const condition = /** @type {Condition} */ (lot.condition);
    type.byCondition.set(condition, (type.byCondition.get(condition) ?? 0) + quantity);
  }

  /** @param {[number, number, number]} d */
  const flatHeight = ([l, w, h]) => Math.min(l + w, h + w);
  const tallest = Math.max(0, ...[...types.values()].map((t) => (t.inside ? flatHeight(t.inside) : 0)));

  return [...types.values()]
    .sort((a, b) => (a.size && b.size ? compareSizeCm(a.size, b.size) : a.size ? -1 : b.size ? 1 : 0) || a.label.localeCompare(b.label))
    .map((t) => {
      const noSize = !t.inside || tallest === 0;
      const heightPct = noSize ? 50 : Math.max(8, Math.round((flatHeight(/** @type {[number, number, number]} */ (t.inside)) / tallest) * 100));
      /** @type {StackGroup["slices"]} */
      const slices = [];
      let total = 0;
      for (const condition of CONDITIONS) {
        const n = t.byCondition.get(condition) ?? 0;
        total += n;
        for (let i = 0; i < n && slices.length < STACK_SLICE_CAP; i++) slices.push({ condition, heightPct });
      }
      return { label: t.label, total, slices, more: total - slices.length, noSize };
    });
}

router.get("/", requireRole("admin", "manager"), async (req, res) => {
  const result = await db.execute({
    sql: `SELECT l.*, p.name AS parent_name FROM locations l ${PARENT_JOIN_SQL}
           WHERE l.org_id = ? ORDER BY ${LOCATION_ORDER_SQL}`,
    args: [defined(req.session.orgId)],
  });
  res.render("pages/locations/index", {
    title: "Locations",
    locations: result.rows,
    saved: req.query.saved === "1",
  });
});

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {{ title: string; location: Record<string, unknown> | null; error: string | null; hasChildren?: boolean }} data
 */
async function renderForm(req, res, data) {
  const id = data.location?.id ? String(data.location.id) : null;
  res.render("pages/locations/form", {
    ...data,
    hasChildren: data.hasChildren ?? false,
    parents: await parentOptions(defined(req.session.orgId), id),
  });
}

router.get("/new", requireRole("admin"), async (req, res) => {
  // ?parent= preselects "Located in", e.g. from a location's "Add sublocation".
  await renderForm(req, res, { title: "New Location", location: { parent_id: typeof req.query.parent === "string" && req.query.parent ? req.query.parent : null }, error: null });
});

router.post("/", requireRole("admin"), async (req, res) => {
  const orgId   = defined(req.session.orgId);
  const orgPlan = req.session.orgPlan ?? "free";
  const name    = str(req.body.name).trim();
  const address = str(req.body.address).trim() || null;
  const parentId = str(req.body.parent_id) || null;
  const wantsJson = req.headers.accept?.includes("application/json") ?? false;
  /** @param {string} error @param {number} status */
  const fail = (error, status) =>
    wantsJson ? res.status(status).json({ error }) : renderForm(req, res, { title: "New Location", location: req.body, error });

  if (!name) return fail("Name is required.", 400);
  const parentError = await checkParent(orgId, null, parentId);
  if (parentError) return fail(parentError, 400);

  // Free-tier gate: 1 top-level location max. Sublocations (stacks, shelves)
  // inside it don't count.
  if (orgPlan === "free" && !parentId) {
    const count = await db.execute({ sql: "SELECT COUNT(*) AS n FROM locations WHERE org_id = ? AND parent_id IS NULL", args: [orgId] });
    if (Number(count.rows[0]?.n) >= 1) {
      return fail("Free plan is limited to 1 location. Upgrade to Pro to add more, or add this inside your existing location.", 403);
    }
  }

  const id = ulid();
  try {
    await db.execute({
      sql: "INSERT INTO locations (id, name, address, active, org_id, parent_id, created_at) VALUES (?, ?, ?, 1, ?, ?, ?)",
      args: [id, name, address, orgId, parentId, now()],
    });
  } catch (err) {
    return fail(locationSaveError(err, !!parentId), 409);
  }

  if (wantsJson) return res.json({ id, name });
  res.redirect(parentId ? `/locations/${parentId}?saved=1` : "/locations?saved=1");
});

router.get("/:id", requireRole("admin", "manager"), (req, res) => renderDetail(req, res, str(req.params.id)));

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {string} id
 * @param {string | null} [error] e.g. why a move was refused
 */
async function renderDetail(req, res, id, error = null) {
  const orgId = defined(req.session.orgId);
  const [locResult, lotResult, childResult] = await Promise.all([
    db.execute({
      sql: `SELECT l.*, p.name AS parent_name, ${LOCATION_LABEL_SQL} AS label
              FROM locations l ${PARENT_JOIN_SQL} WHERE l.id = ? AND l.org_id = ?`,
      args: [id, orgId],
    }),
    db.execute({
      sql: `SELECT il.*, ct.name AS carton_name, ct.unit_cost,
                   ct.length_cm, ct.width_cm, ct.height_cm,
                   ct.printed_length_cm, ct.printed_width_cm, ct.printed_height_cm, ct.source_code
            FROM inventory_lots il
            JOIN carton_types ct ON ct.id = il.carton_type_id
            WHERE il.location_id = ? AND il.org_id = ?
            ORDER BY ct.name, il.condition`,
      args: [id, orgId],
    }),
    // Its sublocations, each with its total stock.
    db.execute({
      sql: `SELECT l.id, l.name, l.active,
                   (SELECT COALESCE(SUM(il.quantity), 0) FROM inventory_lots il WHERE il.location_id = l.id) AS total
              FROM locations l WHERE l.parent_id = ? AND l.org_id = ? ORDER BY l.name`,
      args: [id, orgId],
    }),
  ]);
  const location = locResult.rows[0];
  if (!location) return res.redirect("/locations");
  res.status(error ? 422 : 200).render("pages/locations/detail", {
    title: /** @type {string} */ (location.label),
    location,
    lots: lotResult.rows,
    stack: buildStack(lotResult.rows),
    children: childResult.rows,
    // Where this sublocation can be moved: any other top-level location.
    moveTargets: location.parent_id == null ? [] : await parentOptions(orgId, /** @type {string} */ (location.parent_id)),
    saved: req.query.saved === "1",
    moved: req.query.moved === "1",
    // From Transfer Several: how many cartons landed here.
    transferred: Math.max(0, Math.floor(Number(req.query.transferred)) || 0),
    error,
  });
}

router.get("/:id/edit", requireRole("admin"), async (req, res) => {
  const id = str(req.params.id);
  const orgId = defined(req.session.orgId);
  const result = await db.execute({ sql: "SELECT * FROM locations WHERE id = ? AND org_id = ?", args: [id, orgId] });
  if (!result.rows[0]) return res.redirect("/locations");
  await renderForm(req, res, { title: "Edit Location", location: result.rows[0], error: null, hasChildren: await hasChildren(orgId, id) });
});

router.post("/:id/edit", requireRole("admin"), async (req, res) => {
  const id      = str(req.params.id);
  const orgId   = defined(req.session.orgId);
  const name    = str(req.body.name).trim();
  const address = str(req.body.address).trim() || null;
  const active  = str(req.body.active) === "1" ? 1 : 0;
  const parentId = str(req.body.parent_id) || null;

  /** @param {string} error */
  const fail = async (error) => {
    const result = await db.execute({ sql: "SELECT * FROM locations WHERE id = ? AND org_id = ?", args: [id, orgId] });
    return renderForm(req, res, {
      title: "Edit Location",
      location: { ...result.rows[0], ...req.body },
      error,
      hasChildren: await hasChildren(orgId, id),
    });
  };

  const exists = await db.execute({ sql: "SELECT 1 FROM locations WHERE id = ? AND org_id = ?", args: [id, orgId] });
  if (exists.rows.length === 0) return res.redirect("/locations");

  if (!name) return fail("Name is required.");
  const parentError = await checkParent(orgId, id, parentId);
  if (parentError) return fail(parentError);
  // Pulling a sublocation out to the top level adds a top-level location.
  if ((req.session.orgPlan ?? "free") === "free" && !parentId) {
    const count = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM locations WHERE org_id = ? AND parent_id IS NULL AND id != ?",
      args: [orgId, id],
    });
    if (Number(count.rows[0]?.n) >= 1) return fail("Free plan is limited to 1 location, so this has to stay inside another one.");
  }
  try {
    await db.execute({
      sql: "UPDATE locations SET name=?, address=?, active=?, parent_id=? WHERE id=? AND org_id=?",
      args: [name, address, active, parentId, id, orgId],
    });
  } catch (err) {
    return fail(locationSaveError(err, !!parentId));
  }
  res.redirect("/locations?saved=1");
});

// Moves a sublocation, and so all the stock on it, into another top-level
// location, e.g. carrying a stack from the office to the garage. Stock is
// recorded against the sublocation itself, so no inventory rows change.
router.post("/:id/move", requireRole("admin", "manager"), async (req, res) => {
  const id = str(req.params.id);
  const orgId = defined(req.session.orgId);
  const parentId = str(req.body.parent_id) || null;

  const current = await db.execute({ sql: "SELECT parent_id FROM locations WHERE id = ? AND org_id = ?", args: [id, orgId] });
  if (!current.rows[0]) return res.redirect("/locations");
  const parentError = current.rows[0].parent_id == null
    ? "Only a sublocation can be moved."
    : !parentId ? "Choose where to move it." : await checkParent(orgId, id, parentId);
  if (!parentError) {
    try {
      await db.execute({ sql: "UPDATE locations SET parent_id = ? WHERE id = ? AND org_id = ?", args: [parentId, id, orgId] });
      return res.redirect(`/locations/${id}?moved=1`);
    } catch (err) {
      return renderDetail(req, res, id, locationSaveError(err, true).replace("That location", "The destination"));
    }
  }
  return renderDetail(req, res, id, parentError);
});

/**
 * @param {string} orgId
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function hasChildren(orgId, id) {
  const r = await db.execute({ sql: "SELECT 1 FROM locations WHERE parent_id = ? AND org_id = ? LIMIT 1", args: [id, orgId] });
  return r.rows.length > 0;
}

export default router;
