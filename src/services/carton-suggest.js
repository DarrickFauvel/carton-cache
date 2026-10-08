/**
 * Suggests a carton to pack an item (or bundle, measured as one bounding
 * box) into — first from in-stock carton_types, falling back to the
 * retail_carton_options catalog if nothing on-site fits. Read-only: does
 * not mutate inventory_lots or transactions, so it lives apart from
 * inventory.js.
 */

import { db } from "../db/client.js";
import { inToCm } from "../lib/units.js";
import { buildLabelCode } from "../lib/labels.js";

/** @typedef {import("../types.js").CartonType} CartonType */
/** @typedef {import("../types.js").CartonSuggestion} CartonSuggestion */
/** @typedef {import("../types.js").RetailCartonSuggestion} RetailCartonSuggestion */
/** @typedef {import("../types.js").SuggestCartonResult} SuggestCartonResult */

/**
 * @typedef {object} SuggestArgs
 * @property {string} orgId
 * @property {number} lengthCm
 * @property {number} widthCm
 * @property {number} heightCm
 * @property {number} [dunnageCm]
 * @property {string} [locationId]
 */

/**
 * @param {[number, number, number]} dims
 * @returns {[number, number, number][]}
 */
function permutations([a, b, c]) {
  return [
    [a, b, c], [a, c, b], [b, a, c],
    [b, c, a], [c, a, b], [c, b, a],
  ];
}

/**
 * A cut-down saving less than this isn't worth the effort, so the carton
 * is suggested as-is instead.
 */
const MIN_CUT_CM = 1;

/**
 * Cartons wider and taller than this (inside) can always have their height
 * cut down, whether or not they're flagged resizable.
 */
const CUTTABLE_OVER_CM = inToCm(3);

/**
 * @param {[number, number, number]} carton inside length, width, height
 * @param {boolean} flagged the carton type's resizable flag
 * @returns {boolean}
 */
export function canCut([, width, height], flagged) {
  return flagged || (width > CUTTABLE_OVER_CM && height > CUTTABLE_OVER_CM);
}

/**
 * Tries every orientation of the item against a candidate carton. Fits
 * only if there's room for dunnage (packing padding) on both sides of
 * every axis — hence 2 * dunnageCm per matched dimension.
 *
 * For a resizable carton, the height axis can be cut down to the item's
 * height plus dunnage, so the orientation that needs the shortest carton
 * wins; resizeHeight is that cut height (null if not worth cutting).
 * @param {[number, number, number]} item
 * @param {[number, number, number]} carton
 * @param {number} dunnageCm
 * @param {boolean} [resizable]
 * @returns {{ fits: boolean; leftoverVolume: number; resizeHeight: number | null }}
 */
export function testFit(item, carton, dunnageCm, resizable = false) {
  const [cl, cw, ch] = carton;
  /** @type {{ fits: boolean; leftoverVolume: number; resizeHeight: number | null }} */
  let best = { fits: false, leftoverVolume: Infinity, resizeHeight: null };

  for (const [il, iw, ih] of permutations(item)) {
    const neededHeight = ih + 2 * dunnageCm;
    const fits =
      il + 2 * dunnageCm <= cl &&
      iw + 2 * dunnageCm <= cw &&
      neededHeight <= ch;
    if (!fits) continue;
    const resizeHeight = resizable && ch - neededHeight >= MIN_CUT_CM ? neededHeight : null;
    const leftoverVolume = cl * cw * (resizeHeight ?? ch) - il * iw * ih;
    if (leftoverVolume < best.leftoverVolume) {
      best = { fits: true, leftoverVolume, resizeHeight };
    }
  }

  return best;
}

/**
 * Parses and validates the /suggest query string (shared by the HTML-app
 * route and the JSON API route so both validate identically).
 * @param {import("express").Request["query"]} query
 * @param {string} orgId
 * @returns {{ args: SuggestArgs } | { error: string }}
 */
export function parseSuggestQuery(query, orgId) {
  const length = parseFloat(String(query.length_cm ?? ""));
  const width = parseFloat(String(query.width_cm ?? ""));
  const height = parseFloat(String(query.height_cm ?? ""));
  const dunnage = query.dunnage_cm !== undefined ? parseFloat(String(query.dunnage_cm)) : 2.5;
  const locationId = query.location_id ? String(query.location_id) : undefined;

  if (![length, width, height].every((n) => Number.isFinite(n) && n > 0)) {
    return { error: "length_cm, width_cm, and height_cm are required and must be positive numbers." };
  }
  if (!Number.isFinite(dunnage) || dunnage < 0) {
    return { error: "dunnage_cm must be a non-negative number." };
  }

  return {
    args: { orgId, lengthCm: length, widthCm: width, heightCm: height, dunnageCm: dunnage, locationId },
  };
}

/**
 * @param {SuggestArgs} args
 * @returns {Promise<SuggestCartonResult>}
 */
export async function suggest(args) {
  const dunnageCm = args.dunnageCm ?? 2.5;
  const item = /** @type {[number, number, number]} */ ([args.lengthCm, args.widthCm, args.heightCm]);

  const onSiteSql = `
    SELECT ct.id, ct.name, ct.sku, ct.length_cm, ct.width_cm, ct.height_cm,
           ct.printed_length_cm, ct.printed_width_cm, ct.printed_height_cm, ct.wall_thickness_cm, ct.source_code, ct.resizable, SUM(il.quantity) AS quantity
    FROM carton_types ct
    JOIN inventory_lots il ON il.carton_type_id = ct.id
    WHERE ct.org_id = ?
      AND ct.length_cm IS NOT NULL AND ct.width_cm IS NOT NULL AND ct.height_cm IS NOT NULL
      ${args.locationId ? "AND il.location_id = ?" : ""}
    GROUP BY ct.id
    HAVING SUM(il.quantity) > 0
  `;
  const onSiteArgs = args.locationId ? [args.orgId, args.locationId] : [args.orgId];
  const onSiteRows = await db.execute({ sql: onSiteSql, args: onSiteArgs });

  /** @type {CartonSuggestion[]} */
  const onSite = [];
  for (const row of onSiteRows.rows) {
    const carton = /** @type {[number, number, number]} */ ([
      Number(row.length_cm), Number(row.width_cm), Number(row.height_cm),
    ]);
    const { fits, leftoverVolume, resizeHeight } = testFit(item, carton, dunnageCm, canCut(carton, Number(row.resizable) === 1));
    if (!fits) continue;
    onSite.push({
      id: /** @type {string} */ (row.id),
      name: /** @type {string} */ (row.name),
      sku: /** @type {string | null} */ (row.sku),
      length_cm: carton[0],
      width_cm: carton[1],
      height_cm: carton[2],
      printed_length_cm: row.printed_length_cm == null ? null : Number(row.printed_length_cm),
      printed_width_cm:  row.printed_width_cm == null ? null : Number(row.printed_width_cm),
      printed_height_cm: row.printed_height_cm == null ? null : Number(row.printed_height_cm),
      wall_thickness_cm: Number(row.wall_thickness_cm),
      label_code: buildLabelCode(/** @type {CartonType} */ (/** @type {unknown} */ (row))),
      quantity: Number(row.quantity),
      leftover_volume_cm3: leftoverVolume,
      resize_height_cm: resizeHeight,
    });
  }
  onSite.sort((a, b) => a.leftover_volume_cm3 - b.leftover_volume_cm3);

  if (onSite.length > 0) {
    return { onSite, retail: [] };
  }

  const retailRows = await db.execute({
    sql: `
      SELECT id, store_name, city, name, sku, length_in, width_in, height_in, cost
      FROM retail_carton_options
      WHERE org_id = ?
        AND length_in IS NOT NULL AND width_in IS NOT NULL AND height_in IS NOT NULL
    `,
    args: [args.orgId],
  });

  /** @type {RetailCartonSuggestion[]} */
  const retail = [];
  for (const row of retailRows.rows) {
    const carton = /** @type {[number, number, number]} */ ([
      inToCm(Number(row.length_in)), inToCm(Number(row.width_in)), inToCm(Number(row.height_in)),
    ]);
    const { fits, leftoverVolume } = testFit(item, carton, dunnageCm);
    if (!fits) continue;
    retail.push({
      id: /** @type {string} */ (row.id),
      store_name: /** @type {string} */ (row.store_name),
      city: /** @type {string | null} */ (row.city),
      name: /** @type {string} */ (row.name),
      sku: /** @type {string | null} */ (row.sku),
      length_cm: carton[0],
      width_cm: carton[1],
      height_cm: carton[2],
      cost: /** @type {number | null} */ (row.cost),
      leftover_volume_cm3: leftoverVolume,
    });
  }
  retail.sort((a, b) => a.leftover_volume_cm3 - b.leftover_volume_cm3);

  return { onSite, retail };
}
