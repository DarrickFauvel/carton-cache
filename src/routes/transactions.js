import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { LOCATION_ACTIVE_SQL, LOCATION_LABEL_SQL, LOCATION_ORDER_SQL, PARENT_JOIN_SQL, locationOptions } from "../lib/locations.js";
import * as inventory from "../services/inventory.js";
import { str, defined } from "../lib/id.js";
import { buildLabelCode } from "../lib/labels.js";
import { labelCodeOptions } from "./cartons.js";

/** @typedef {import("../types.js").Condition} Condition */
/** @typedef {import("../types.js").CartonType} CartonType */

const router = Router();

// ── Receive ───────────────────────────────────────────────────────────────────

router.get("/receive", requireAuth, async (req, res) => {
  const orgId = defined(req.session.orgId);
  const { userRole } = req.session;
  const [locations, cartons, { sourceCodes }] = await Promise.all([
    locationOptions(orgId),
    db.execute({ sql: "SELECT id, name, length_cm, width_cm, height_cm, printed_length_cm, printed_width_cm, printed_height_cm, barcode, unit_cost FROM carton_types WHERE org_id = ? ORDER BY name", args: [orgId] }),
    labelCodeOptions(orgId),
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
    locations,
    cartons: cartons.rows,
    canCreateLocation: userRole === "admin",
    canCreateCarton: userRole === "admin" || userRole === "manager",
    sourceCodes,
    componentScripts: ["barcode-scanner", "quick-create", "carton-scanner", "qty-stepper", "label-preview"],
    printLabelCarton,
    // Preselect the location last received into, for the next carton and
    // later visits.
    selectedLocationId: req.session.lastReceiveLocationId ?? "",
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
  req.session.lastReceiveLocationId = str(location_id);
  res.redirect(`/transactions/receive?printLabel=${encodeURIComponent(str(carton_type_id))}`);
});

// ── Consume ───────────────────────────────────────────────────────────────────

/** @type {Condition[]} */
const CONDITIONS = ["new", "good", "fair", "poor"];

/**
 * @typedef {object} ConsumeFormValues
 * @property {string} location_id
 * @property {string} carton_type_id
 * @property {string} condition
 * @property {string} quantity
 * @property {string} notes
 */

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {{ error?: string | null, values?: Partial<ConsumeFormValues> }} [opts]
 */
async function renderConsume(req, res, { error = null, values = {} } = {}) {
  const orgId = defined(req.session.orgId);
  const [locations, cartons] = await Promise.all([
    // Only locations holding some stock: there's nothing to consume elsewhere.
    db.execute({
      sql: `SELECT l.id, ${LOCATION_LABEL_SQL} AS name FROM locations l ${PARENT_JOIN_SQL}
             WHERE ${LOCATION_ACTIVE_SQL} AND l.org_id = ?
               AND EXISTS (SELECT 1 FROM inventory_lots il
                            WHERE il.location_id = l.id AND il.org_id = l.org_id AND il.quantity > 0)
             ORDER BY ${LOCATION_ORDER_SQL}`,
      args: [orgId],
    }).then((r) => r.rows),
    // stock: as on Transfer, so the page can limit the list to types in
    // stock at the chosen location.
    db.execute({
      sql: `SELECT ct.id, ct.name, ct.length_cm, ct.width_cm, ct.height_cm,
                   ct.printed_length_cm, ct.printed_width_cm, ct.printed_height_cm, ct.barcode,
                   (SELECT group_concat(il.location_id || ':' || il.condition || ':' || il.quantity, ' ')
                      FROM inventory_lots il
                     WHERE il.carton_type_id = ct.id AND il.org_id = ct.org_id AND il.quantity > 0) AS stock
            FROM carton_types ct WHERE ct.org_id = ? AND ct.archived_at IS NULL ORDER BY ct.name`,
      args: [orgId],
    }),
  ]);
  res.status(error ? 422 : 200).render("pages/transactions/consume", {
    title: "Consume Stock",
    locations,
    cartons: cartons.rows,
    componentScripts: ["barcode-scanner", "carton-scanner", "carton-suggest", "location-stock-filter", "qty-stepper"],
    error,
    // Preselect the location last consumed from (see Receive), unless a
    // re-render after a failed POST passes the submitted values.
    values: {
      location_id: req.session.lastConsumeLocationId ?? "",
      carton_type_id: "",
      condition: "good",
      quantity: "1",
      notes: "",
      ...values,
    },
  });
}

router.get("/consume", requireAuth, (req, res) => renderConsume(req, res));

router.post("/consume", requireAuth, async (req, res) => {
  /** @type {ConsumeFormValues} */
  const values = {
    location_id:    str(req.body.location_id),
    carton_type_id: str(req.body.carton_type_id),
    condition:      str(req.body.condition),
    quantity:       str(req.body.quantity),
    notes:          str(req.body.notes),
  };
  const quantity = Number(values.quantity);

  /** @param {string} error */
  const reject = (error) => renderConsume(req, res, { error, values });

  if (!values.location_id || !values.carton_type_id) return reject("Choose a location and a carton type.");
  const condition = CONDITIONS.find((c) => c === values.condition);
  if (!condition) return reject("Choose a valid condition.");
  if (!Number.isInteger(quantity) || quantity < 1) return reject("Quantity must be a whole number of at least 1.");

  try {
    await inventory.consume({
      orgId: defined(req.session.orgId),
      locationId: values.location_id,
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
          ? `None of that carton type are in stock in ${condition} condition at that location.`
          : `Only ${err.available} of that carton type are in stock in ${condition} condition at that location.`
      );
    }
    throw err;
  }
  req.session.lastConsumeLocationId = values.location_id;
  res.redirect("/");
});

// ── Transfer ──────────────────────────────────────────────────────────────────

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
    locationOptions(orgId),
    // stock: space-separated "location_id:condition:quantity" entries for each
    // lot holding this type, so the page can filter the list by the chosen
    // "from" location and condition and cap the quantity.
    db.execute({
      sql: `SELECT ct.id, ct.name, ct.length_cm, ct.width_cm, ct.height_cm,
                   ct.printed_length_cm, ct.printed_width_cm, ct.printed_height_cm, ct.barcode,
                   (SELECT group_concat(il.location_id || ':' || il.condition || ':' || il.quantity, ' ')
                      FROM inventory_lots il
                     WHERE il.carton_type_id = ct.id AND il.org_id = ct.org_id AND il.quantity > 0) AS stock
            FROM carton_types ct WHERE ct.org_id = ? AND ct.archived_at IS NULL ORDER BY ct.name`,
      args: [orgId],
    }),
  ]);
  res.status(error ? 422 : 200).render("pages/transactions/transfer", {
    title: "Transfer Stock",
    locations,
    cartons: cartons.rows,
    error,
    // A re-render after a failed POST passes the submitted locations in
    // `values`, which win over the ones remembered from the last transfer.
    values: {
      condition: "good",
      quantity: "1",
      from_location_id: req.session.lastTransferFromLocationId ?? "",
      to_location_id: req.session.lastTransferToLocationId ?? "",
      ...values,
    },
    componentScripts: ["location-stock-filter", "qty-stepper"],
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
  req.session.lastTransferFromLocationId = values.from_location_id;
  req.session.lastTransferToLocationId = values.to_location_id;
  res.redirect("/");
});

// ── Transfer several ──────────────────────────────────────────────────────────

/**
 * @typedef {object} TransferSeveralValues
 * @property {string} from_location_id
 * @property {string} to_location_id
 * @property {string[]} lots selected "carton_type_id:condition" keys
 * @property {Record<string, string>} qty quantity per lot key
 * @property {string} notes
 */

/**
 * Lists everything in stock at the chosen "from" location as a checklist, so
 * several carton types (e.g. a whole stack's worth) move in one submit.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {{ error?: string | null, values?: Partial<TransferSeveralValues> }} [opts]
 */
async function renderTransferSeveral(req, res, { error = null, values = {} } = {}) {
  const orgId = defined(req.session.orgId);
  /** @param {unknown} v */
  const q = (v) => (typeof v === "string" ? v : "");
  const from = values.from_location_id ?? q(req.query.from);
  const to = values.to_location_id ?? (q(req.query.to) || req.session.lastTransferToLocationId || "");
  const [locations, lots] = await Promise.all([
    locationOptions(orgId),
    from
      ? db.execute({
          // Length, then width, then height, smallest first (printed size if
          // set, as on the label), the way cartons sit in a stack.
          sql: `SELECT il.carton_type_id, il.condition, il.quantity, ct.name,
                       ct.length_cm, ct.width_cm, ct.height_cm,
                       ct.printed_length_cm, ct.printed_width_cm, ct.printed_height_cm, ct.source_code
                  FROM inventory_lots il
                  JOIN carton_types ct ON ct.id = il.carton_type_id
                 WHERE il.location_id = ? AND il.org_id = ? AND il.quantity > 0
                 ORDER BY COALESCE(ct.printed_length_cm, ct.length_cm) IS NULL,
                          COALESCE(ct.printed_length_cm, ct.length_cm),
                          COALESCE(ct.printed_width_cm, ct.width_cm),
                          COALESCE(ct.printed_height_cm, ct.height_cm),
                          ct.name, il.condition`,
          args: [from, orgId],
        }).then((r) => r.rows.map((row) => ({
          key: `${row.carton_type_id}:${row.condition}`,
          name: String(row.name),
          condition: String(row.condition),
          quantity: Number(row.quantity),
          label_code: buildLabelCode(/** @type {CartonType} */ (/** @type {unknown} */ (row))),
        })))
      : Promise.resolve([]),
  ]);
  res.status(error ? 422 : 200).render("pages/transactions/transfer-several", {
    title: "Transfer Several",
    locations,
    lots,
    error,
    values: { from_location_id: from, to_location_id: to, lots: [], qty: {}, notes: "", ...values },
  });
}

router.get("/transfer/several", requireAuth, (req, res) => renderTransferSeveral(req, res));

router.post("/transfer/several", requireAuth, async (req, res) => {
  const orgId = defined(req.session.orgId);
  const rawLots = req.body.lot;
  const rawQty = req.body.qty && typeof req.body.qty === "object" ? req.body.qty : {};
  /** @type {TransferSeveralValues} */
  const values = {
    from_location_id: str(req.body.from_location_id),
    to_location_id:   str(req.body.to_location_id),
    lots: (Array.isArray(rawLots) ? rawLots : rawLots ? [rawLots] : []).map(String),
    qty: Object.fromEntries(Object.entries(rawQty).map(([k, v]) => [k, String(v)])),
    notes: str(req.body.notes),
  };
  /** @param {string} error */
  const reject = (error) => renderTransferSeveral(req, res, { error, values });

  if (!values.from_location_id || !values.to_location_id) return reject("Choose both locations.");
  if (values.from_location_id === values.to_location_id) return reject("From and to locations must be different.");
  if (values.lots.length === 0) return reject("Tick at least one carton to transfer.");

  /** @type {import("../services/inventory.js").TransferLine[]} */
  const lines = [];
  for (const key of values.lots) {
    const [cartonTypeId, cond] = key.split(":");
    const condition = CONDITIONS.find((c) => c === cond);
    const quantity = Number(values.qty[key]);
    if (!cartonTypeId || !condition) return reject("One of the selected cartons isn't valid. Reload the page and try again.");
    if (!Number.isInteger(quantity) || quantity < 1) return reject("Each ticked carton needs a whole-number quantity of at least 1.");
    lines.push({ cartonTypeId, condition, quantity });
  }

  const destination = await db.execute({
    sql: "SELECT 1 FROM locations WHERE id = ? AND org_id = ? AND active = 1",
    args: [values.to_location_id, orgId],
  });
  if (!destination.rows[0]) return reject("Choose a valid destination location.");

  try {
    await inventory.transferMany({
      orgId,
      fromLocationId: values.from_location_id,
      toLocationId: values.to_location_id,
      lines,
      userId: defined(req.session.userId),
      notes: values.notes || undefined,
    });
  } catch (err) {
    if (err instanceof inventory.InsufficientStockError && err.line) {
      const carton = await db.execute({ sql: "SELECT name FROM carton_types WHERE id = ? AND org_id = ?", args: [err.line.cartonTypeId, orgId] });
      const name = String(carton.rows[0]?.name ?? "a carton");
      return reject(
        `Nothing was transferred: only ${err.available} of ${name} (${err.line.condition}) ${err.available === 1 ? "is" : "are"} in stock at the from location now.`
      );
    }
    throw err;
  }
  req.session.lastTransferFromLocationId = values.from_location_id;
  req.session.lastTransferToLocationId = values.to_location_id;
  const role = req.session.userRole;
  res.redirect(role === "admin" || role === "manager" ? `/locations/${values.to_location_id}?transferred=${lines.reduce((n, l) => n + l.quantity, 0)}` : "/");
});

// ── Adjustment ────────────────────────────────────────────────────────────────

router.get("/adjust", requireRole("admin", "manager"), async (req, res) => {
  const orgId = defined(req.session.orgId);
  const [locations, cartons] = await Promise.all([
    locationOptions(orgId),
    db.execute({ sql: "SELECT id, name, length_cm, width_cm, height_cm, printed_length_cm, printed_width_cm, printed_height_cm FROM carton_types WHERE org_id = ? AND archived_at IS NULL ORDER BY name", args: [orgId] }),
  ]);
  res.render("pages/transactions/adjust", {
    title: "Adjust Stock",
    locations,
    cartons: cartons.rows,
    componentScripts: ["qty-stepper"],
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
    SELECT t.*, ct.name AS carton_name, ${LOCATION_LABEL_SQL} AS location_name, u.name AS user_name
    FROM transactions t
    JOIN carton_types ct ON ct.id = t.carton_type_id
    JOIN locations l ON l.id = t.location_id
    ${PARENT_JOIN_SQL}
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
    locationOptions(orgId, { includeInactive: true }),
    db.execute({ sql: "SELECT id, name FROM carton_types WHERE org_id = ? ORDER BY name", args: [orgId] }),
  ]);

  res.render("pages/transactions/history", {
    title: "Transaction History",
    transactions: txResult.rows,
    locations,
    cartons: cartons.rows,
    filters: { location, type, carton, from, to },
  });
});

export default router;
