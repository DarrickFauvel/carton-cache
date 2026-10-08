import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { defined } from "../lib/id.js";
import { buildLabelCode } from "../lib/labels.js";

/** @typedef {import("../types.js").Condition} Condition */
/** @typedef {import("../types.js").CartonType} CartonType */

/** @type {readonly Condition[]} */
const CONDITIONS = ["new", "good", "fair", "poor"];

/**
 * One carton type's stock at one location, summed over conditions.
 * @typedef {object} StockRow
 * @property {string} id anchor id, unique per location + carton type
 * @property {string} carton_type_id
 * @property {string} name
 * @property {string | null} label_code see buildLabelCode(); leads the row when set
 * @property {number | null} length_cm
 * @property {number | null} width_cm
 * @property {number | null} height_cm
 * @property {{ condition: Condition; quantity: number }[]} conditions in CONDITIONS order, only those in stock
 * @property {number} total
 * @property {boolean} low at or below one of its alert thresholds
 */

/**
 * @typedef {object} LowStockAlert
 * @property {string} rowId
 * @property {string} location_name
 * @property {string} name
 * @property {Condition | "any"} condition
 * @property {number} quantity
 * @property {number} min_quantity
 */

/**
 * @typedef {object} StockLocation
 * @property {string} name
 * @property {StockRow[]} rows smallest carton first
 */

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const orgId = defined(req.session.orgId);

  const [lotResult, thresholdResult] = await Promise.all([
    db.execute({
      sql: `
        SELECT il.location_id, il.carton_type_id, il.condition, il.quantity,
               ct.name, ct.length_cm, ct.width_cm, ct.height_cm,
               ct.printed_length_cm, ct.printed_width_cm, ct.printed_height_cm, ct.source_code,
               l.name AS location_name
        FROM inventory_lots il
        JOIN carton_types ct ON ct.id = il.carton_type_id
        JOIN locations l ON l.id = il.location_id
        WHERE il.quantity > 0 AND il.org_id = ?
      `,
      args: [orgId],
    }),
    // Joined to names so a carton that has run out entirely (no lot with
    // quantity > 0) still gets a row to flag.
    db.execute({
      sql: `
        SELECT at.location_id, at.carton_type_id, at.condition, at.min_quantity,
               ct.name, ct.length_cm, ct.width_cm, ct.height_cm,
               ct.printed_length_cm, ct.printed_width_cm, ct.printed_height_cm, ct.source_code,
               l.name AS location_name
        FROM alert_thresholds at
        JOIN carton_types ct ON ct.id = at.carton_type_id AND ct.archived_at IS NULL
        JOIN locations l ON l.id = at.location_id AND l.active = 1
        WHERE at.org_id = ?
      `,
      args: [orgId],
    }),
  ]);

  /** @type {Map<string, StockLocation>} */
  const locations = new Map();
  /** @type {Map<string, StockRow & { byCondition: Map<Condition, number> }>} */
  const rows = new Map();

  /**
   * @param {import("@libsql/client").Row} r
   */
  const rowFor = (r) => {
    const locationId = String(r.location_id);
    const key = `${locationId}:${r.carton_type_id}`;
    let row = rows.get(key);
    if (!row) {
      const num = (/** @type {unknown} */ v) => (v == null ? null : Number(v));
      row = {
        id: `stock-${locationId}-${r.carton_type_id}`,
        carton_type_id: String(r.carton_type_id),
        name: String(r.name),
        label_code: buildLabelCode(/** @type {CartonType} */ (/** @type {unknown} */ (r))),
        length_cm: num(r.length_cm),
        width_cm: num(r.width_cm),
        height_cm: num(r.height_cm),
        conditions: [],
        total: 0,
        low: false,
        byCondition: new Map(),
      };
      rows.set(key, row);
      let location = locations.get(locationId);
      if (!location) {
        location = { name: String(r.location_name), rows: [] };
        locations.set(locationId, location);
      }
      location.rows.push(row);
    }
    return row;
  };

  for (const lot of lotResult.rows) {
    const row = rowFor(lot);
    const condition = /** @type {Condition} */ (lot.condition);
    row.byCondition.set(condition, (row.byCondition.get(condition) ?? 0) + Number(lot.quantity));
    row.total += Number(lot.quantity);
  }

  /** @type {LowStockAlert[]} */
  const lowStock = [];
  for (const t of thresholdResult.rows) {
    const row = rowFor(t);
    const condition = /** @type {Condition | "any"} */ (t.condition);
    // "any" compares the total across conditions; otherwise just that condition.
    const quantity = condition === "any" ? row.total : (row.byCondition.get(condition) ?? 0);
    const min = Number(t.min_quantity);
    if (quantity > min) continue;
    row.low = true;
    lowStock.push({
      rowId: row.id,
      location_name: String(t.location_name),
      name: row.label_code ?? row.name,
      condition,
      quantity,
      min_quantity: min,
    });
  }

  /** @param {StockRow} r */
  const volume = (r) =>
    r.length_cm != null && r.width_cm != null && r.height_cm != null ? r.length_cm * r.width_cm * r.height_cm : Infinity;
  for (const row of rows.values()) {
    row.conditions = CONDITIONS.filter((c) => row.byCondition.has(c)).map((c) => ({
      condition: c,
      quantity: /** @type {number} */ (row.byCondition.get(c)),
    }));
  }
  const sortedLocations = [...locations.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const location of sortedLocations) {
    location.rows.sort((a, b) => volume(a) - volume(b) || a.name.localeCompare(b.name));
  }
  lowStock.sort((a, b) => a.quantity - b.quantity || a.location_name.localeCompare(b.location_name));

  res.render("pages/dashboard", {
    title: "Dashboard",
    locations: sortedLocations,
    lowStock,
  });
});

export default router;
