/**
 * Locations nest one level: a location can sit inside a top-level one (e.g.
 * a stack of cartons on the office shelf), via locations.parent_id. Stock
 * lives on whichever location it was received into, so moving a stack to
 * another parent moves its stock with it.
 *
 * The SQL fragments below assume the query aliases the location as `l` and
 * LEFT JOINs its parent as `p`:
 *   FROM locations l LEFT JOIN locations p ON p.id = l.parent_id
 */

import { db } from "../db/client.js";

/** Display label: "Office" for a top-level location, "Office › Stack 1" for one inside it. */
export const LOCATION_LABEL_SQL = "CASE WHEN p.id IS NULL THEN l.name ELSE p.name || ' › ' || l.name END";

/** Alphabetical, each location directly followed by its own sublocations. */
export const LOCATION_ORDER_SQL = "COALESCE(p.name, l.name), p.id IS NOT NULL, l.name";

/** A sublocation of an inactive location counts as inactive too. */
export const LOCATION_ACTIVE_SQL = "l.active = 1 AND (p.id IS NULL OR p.active = 1)";

/** The LEFT JOIN the fragments above rely on. */
export const PARENT_JOIN_SQL = "LEFT JOIN locations p ON p.id = l.parent_id";

/**
 * Locations for a <select>, with `name` already the display label (so
 * templates can keep using `loc.name`).
 * @param {string} orgId
 * @param {{ includeInactive?: boolean }} [opts]
 * @returns {Promise<{ id: string; name: string; parent_id: string | null }[]>}
 */
export async function locationOptions(orgId, { includeInactive = false } = {}) {
  const result = await db.execute({
    sql: `SELECT l.id, ${LOCATION_LABEL_SQL} AS name, l.parent_id
            FROM locations l ${PARENT_JOIN_SQL}
           WHERE l.org_id = ? ${includeInactive ? "" : `AND ${LOCATION_ACTIVE_SQL}`}
           ORDER BY ${LOCATION_ORDER_SQL}`,
    args: [orgId],
  });
  return result.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    parent_id: r.parent_id == null ? null : String(r.parent_id),
  }));
}

/**
 * Top-level locations in the org, the only ones a location can be placed in.
 * @param {string} orgId
 * @param {string | null} [excludeId] the location being edited, which can't contain itself
 * @returns {Promise<{ id: string; name: string; active: number }[]>}
 */
export async function parentOptions(orgId, excludeId = null) {
  const result = await db.execute({
    sql: `SELECT id, name, active FROM locations
           WHERE org_id = ? AND parent_id IS NULL AND id IS NOT ?
           ORDER BY name`,
    args: [orgId, excludeId],
  });
  return result.rows.map((r) => ({ id: String(r.id), name: String(r.name), active: Number(r.active) }));
}

/**
 * Validates a requested parent for `locationId` (null when creating).
 * @param {string} orgId
 * @param {string | null} locationId
 * @param {string | null} parentId
 * @returns {Promise<string | null>} an error message, or null if it's allowed
 */
export async function checkParent(orgId, locationId, parentId) {
  if (locationId) {
    const children = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM locations WHERE parent_id = ? AND org_id = ?",
      args: [locationId, orgId],
    });
    if (parentId && Number(children.rows[0]?.n) > 0) {
      return "This location has its own sublocations, so it can't be placed inside another one.";
    }
  }
  if (!parentId) return null;
  if (parentId === locationId) return "A location can't be inside itself.";
  const parent = await db.execute({
    sql: "SELECT parent_id FROM locations WHERE id = ? AND org_id = ?",
    args: [parentId, orgId],
  });
  if (!parent.rows[0]) return "Choose a valid location to put it in.";
  if (parent.rows[0].parent_id != null) return "Sublocations can only go inside a top-level location.";
  return null;
}

/**
 * Turns a UNIQUE failure on the location name into a message.
 * @param {unknown} err
 * @param {boolean} hasParent
 * @returns {string}
 */
export function locationSaveError(err, hasParent) {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes("UNIQUE")) return "Could not save location.";
  return hasParent
    ? "That location already has a sublocation with that name."
    : "A location with that name already exists.";
}
