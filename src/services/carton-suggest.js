/**
 * Suggests a carton to pack an item (or bundle, measured as one bounding
 * box) into — first from in-stock carton_types, falling back to the
 * retail_carton_options catalog if nothing on-site fits. Read-only: does
 * not mutate inventory_lots or transactions, so it lives apart from
 * inventory.js.
 */

import { db } from "../db/client.js";
import { inToCm } from "../lib/units.js";

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
 * Tries every orientation of the item against a candidate carton. Fits
 * only if there's room for dunnage (packing padding) on both sides of
 * every axis — hence 2 * dunnageCm per matched dimension.
 * @param {[number, number, number]} item
 * @param {[number, number, number]} carton
 * @param {number} dunnageCm
 * @returns {{ fits: boolean; leftoverVolume: number }}
 */
export function testFit(item, carton, dunnageCm) {
  const [cl, cw, ch] = carton;
  const cartonVolume = cl * cw * ch;
  let best = { fits: false, leftoverVolume: Infinity };

  for (const [il, iw, ih] of permutations(item)) {
    const fits =
      il + 2 * dunnageCm <= cl &&
      iw + 2 * dunnageCm <= cw &&
      ih + 2 * dunnageCm <= ch;
    if (fits) {
      const leftoverVolume = cartonVolume - il * iw * ih;
      if (leftoverVolume < best.leftoverVolume) {
        best = { fits: true, leftoverVolume };
      }
    }
  }

  return best;
}

/**
 * @param {SuggestArgs} args
 * @returns {Promise<SuggestCartonResult>}
 */
export async function suggest(args) {
  const dunnageCm = args.dunnageCm ?? 2.5;
  const item = /** @type {[number, number, number]} */ ([args.lengthCm, args.widthCm, args.heightCm]);

  const onSiteSql = `
    SELECT ct.id, ct.name, ct.sku, ct.length_cm, ct.width_cm, ct.height_cm, SUM(il.quantity) AS quantity
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
    const { fits, leftoverVolume } = testFit(item, carton, dunnageCm);
    if (!fits) continue;
    onSite.push({
      id: /** @type {string} */ (row.id),
      name: /** @type {string} */ (row.name),
      sku: /** @type {string | null} */ (row.sku),
      length_cm: carton[0],
      width_cm: carton[1],
      height_cm: carton[2],
      quantity: Number(row.quantity),
      leftover_volume_cm3: leftoverVolume,
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
