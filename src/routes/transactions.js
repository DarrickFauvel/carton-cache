import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import * as inventory from "../services/inventory.js";
import { str, defined } from "../lib/id.js";
import { buildLabelCode } from "../lib/labels.js";

/** @typedef {import("../types.js").Condition} Condition */
/** @typedef {import("../types.js").CartonType} CartonType */

const router = Router();

// ── Receive ───────────────────────────────────────────────────────────────────

router.get("/receive", requireAuth, async (req, res) => {
  const orgId = defined(req.session.orgId);
  const { userRole } = req.session;
  const [locations, cartons] = await Promise.all([
    db.execute({ sql: "SELECT id, name FROM locations WHERE active = 1 AND org_id = ? ORDER BY name", args: [orgId] }),
    db.execute({ sql: "SELECT id, name, length_cm, width_cm, height_cm, barcode, unit_cost FROM carton_types WHERE org_id = ? ORDER BY name", args: [orgId] }),
  ]);

  let printLabelCarton = null;
  if (req.query.printLabel) {
    const result = await db.execute({
      sql: "SELECT * FROM carton_types WHERE id = ? AND org_id = ?",
      args: [String(req.query.printLabel), orgId],
    });
    const carton = /** @type {CartonType | undefined} */ (/** @type {unknown} */ (result.rows[0]));
    if (carton) {
      printLabelCarton = { id: carton.id, name: carton.name, labelCode: buildLabelCode(carton) };
    }
  }

  res.render("pages/transactions/receive", {
    title: "Receive Stock",
    locations: locations.rows,
    cartons: cartons.rows,
    canCreateLocation: userRole === "admin",
    canCreateCarton: userRole === "admin" || userRole === "manager",
    componentScripts: ["barcode-scanner", "quick-create", "carton-scanner"],
    printLabelCarton,
    // Keep the location from the last receive selected for the next carton.
    selectedLocationId: String(req.query.location ?? ""),
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
  const params = new URLSearchParams({ printLabel: str(carton_type_id), location: str(location_id) });
  res.redirect(`/transactions/receive?${params}`);
});

// ── Consume ───────────────────────────────────────────────────────────────────

router.get("/consume", requireAuth, async (req, res) => {
  const orgId = defined(req.session.orgId);
  const [locations, cartons] = await Promise.all([
    db.execute({ sql: "SELECT id, name FROM locations WHERE active = 1 AND org_id = ? ORDER BY name", args: [orgId] }),
    db.execute({ sql: "SELECT id, name, length_cm, width_cm, height_cm, barcode FROM carton_types WHERE org_id = ? ORDER BY name", args: [orgId] }),
  ]);
  res.render("pages/transactions/consume", {
    title: "Consume Stock",
    locations: locations.rows,
    cartons: cartons.rows,
    componentScripts: ["barcode-scanner", "carton-scanner", "carton-suggest"],
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

/** @type {Condition[]} */
const CONDITIONS = ["new", "good", "fair", "poor"];

/**
 * @typedef {object} TransferFormValues
 * @property {string} from_location_id
 * @property {string} to_location_id
 * @property {string} carton_type_id
 * @property {string} condition
 * @property {string} quantity
 * @property {string} notes
 */

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {{ error?: string | null, values?: Partial<TransferFormValues> }} [opts]
 */
async function renderTransfer(req, res, { error = null, values = {} } = {}) {
  const orgId = defined(req.session.orgId);
  const [locations, cartons] = await Promise.all([
    db.execute({ sql: "SELECT id, name FROM locations WHERE active = 1 AND org_id = ? ORDER BY name", args: [orgId] }),
    // stock: space-separated "location_id:condition:quantity" entries for each
    // lot holding this type, so the page can filter the list by the chosen
    // "from" location and condition and cap the quantity.
    db.execute({
      sql: `SELECT ct.id, ct.name, ct.length_cm, ct.width_cm, ct.height_cm, ct.barcode,
                   (SELECT group_concat(il.location_id || ':' || il.condition || ':' || il.quantity, ' ')
                      FROM inventory_lots il
                     WHERE il.carton_type_id = ct.id AND il.org_id = ct.org_id AND il.quantity > 0) AS stock
            FROM carton_types ct WHERE ct.org_id = ? ORDER BY ct.name`,
      args: [orgId],
    }),
  ]);
  res.status(error ? 422 : 200).render("pages/transactions/transfer", {
    title: "Transfer Stock",
    locations: locations.rows,
    cartons: cartons.rows,
    error,
    values: { condition: "good", quantity: "1", ...values },
    componentScripts: ["location-stock-filter"],
  });
}

router.get("/transfer", requireAuth, (req, res) => renderTransfer(req, res));

router.post("/transfer", requireAuth, async (req, res) => {
  const orgId = defined(req.session.orgId);
  /** @type {TransferFormValues} */
  const values = {
    from_location_id: str(req.body.from_location_id),
    to_location_id:   str(req.body.to_location_id),
    carton_type_id:   str(req.body.carton_type_id),
    condition:        str(req.body.condition),
    quantity:         str(req.body.quantity),
    notes:            str(req.body.notes),
  };
  const quantity = Number(values.quantity);

  /** @param {string} error */
  const reject = (error) => renderTransfer(req, res, { error, values });

  if (!values.from_location_id || !values.to_location_id || !values.carton_type_id) {
    return reject("Choose both locations and a carton type.");
  }
  if (values.from_location_id === values.to_location_id) {
    return reject("From and to locations must be different.");
  }
  const condition = CONDITIONS.find((c) => c === values.condition);
  if (!condition) return reject("Choose a valid condition.");
  if (!Number.isInteger(quantity) || quantity < 1) return reject("Quantity must be a whole number of at least 1.");

  const destination = await db.execute({
    sql: "SELECT 1 FROM locations WHERE id = ? AND org_id = ? AND active = 1",
    args: [values.to_location_id, orgId],
  });
  if (!destination.rows[0]) return reject("Choose a valid destination location.");

  try {
    await inventory.transfer({
      orgId,
      fromLocationId: values.from_location_id,
      toLocationId: values.to_location_id,
      cartonTypeId: values.carton_type_id,
      condition,
      quantity,
      userId: defined(req.session.userId),
      notes: values.notes || undefined,
    });
  } catch (err) {
    if (err instanceof inventory.InsufficientStockError) {
      return reject(
        err.available === 0
          ? `None of that carton type are in stock in ${condition} condition at the from location.`
          : `Only ${err.available} of that carton type are in stock in ${condition} condition at the from location.`
      );
    }
    throw err;
  }
  res.redirect("/");
});

// ── Adjustment ────────────────────────────────────────────────────────────────

router.get("/adjust", requireRole("admin", "manager"), async (req, res) => {
  const orgId = defined(req.session.orgId);
  const [locations, cartons] = await Promise.all([
    db.execute({ sql: "SELECT id, name FROM locations WHERE active = 1 AND org_id = ? ORDER BY name", args: [orgId] }),
    db.execute({ sql: "SELECT id, name, length_cm, width_cm, height_cm FROM carton_types WHERE org_id = ? ORDER BY name", args: [orgId] }),
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
