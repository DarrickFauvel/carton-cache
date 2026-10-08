/** @typedef {import("../types.js").MeasurementUnit} MeasurementUnit */

export const CM_PER_INCH = 2.54;

/** @type {MeasurementUnit} */
export const DEFAULT_UNIT = "in";

/** @param {number} inches @returns {number} */
export const inToCm = (inches) => inches * CM_PER_INCH;

/** @param {number} cm @returns {number} */
export const cmToIn = (cm) => cm / CM_PER_INCH;

/**
 * Typical single-wall corrugated board, 1/8 in. Must match the column
 * default in src/db/migrations/015_carton_printed_size_and_wall_thickness.sql.
 */
export const DEFAULT_WALL_THICKNESS_CM = inToCm(0.125);

/**
 * Outer size along one axis of a carton, from its actual inside dimension:
 * one wall on each side.
 * @param {number} insideCm
 * @param {number} wallThicknessCm
 * @returns {number}
 */
export const outerCm = (insideCm, wallThicknessCm) => insideCm + 2 * wallThicknessCm;

/**
 * Anything other than "cm" falls back to the default (imperial).
 * @param {unknown} value
 * @returns {MeasurementUnit}
 */
export const parseUnit = (value) => (value === "cm" ? "cm" : DEFAULT_UNIT);

/** @param {number} value @param {MeasurementUnit} unit @returns {number} */
export const toCm = (value, unit) => (unit === "cm" ? value : inToCm(value));

/**
 * Convert a stored cm value for display, rounded (to 2 decimals by default)
 * so float noise (30.48 cm → 12.000000000000002 in) doesn't leak into the UI.
 * @param {number} cm
 * @param {MeasurementUnit} unit
 * @param {number} [decimals]
 * @returns {number}
 */
export const fromCm = (cm, unit, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((unit === "cm" ? cm : cmToIn(cm)) * factor) / factor;
};

/**
 * "L × W × H unit" (thin spaces around ×, for plain-text contexts like
 * <option>; HTML views use .dim-x instead), or null if any dimension is missing.
 * @param {(number | null | undefined)[]} dims in cm
 * @param {MeasurementUnit} unit
 * @returns {string | null}
 */
function formatDimList(dims, unit) {
  if (dims.some((d) => d == null)) return null;
  return `${dims.map((cm) => fromCm(Number(cm), unit)).join("\u2009×\u2009")} ${unit}`;
}

/**
 * A carton's actual inside dimensions, formatted (see formatDimList).
 * @param {{ length_cm?: number | null; width_cm?: number | null; height_cm?: number | null }} carton
 * @param {MeasurementUnit} unit
 * @returns {string | null}
 */
export function formatDims(carton, unit) {
  return formatDimList([carton.length_cm, carton.width_cm, carton.height_cm], unit);
}

/**
 * The size printed on a carton, formatted (see formatDimList).
 * @param {{ printed_length_cm?: number | null; printed_width_cm?: number | null; printed_height_cm?: number | null }} carton
 * @param {MeasurementUnit} unit
 * @returns {string | null}
 */
export function formatPrintedDims(carton, unit) {
  return formatDimList([carton.printed_length_cm, carton.printed_width_cm, carton.printed_height_cm], unit);
}

/**
 * How a carton type is named in pickers and lists: its name plus its
 * dimensions, which tell cartons apart better than the SKU does. Leads with
 * the printed size (what's on the box) when it has one, and adds the actual
 * inside size when that differs, e.g. "unbranded — 6 × 6 × 6 in (inside
 * 5.75 × 5.75 × 6.25 in)".
 * @param {{ name: string; length_cm?: number | null; width_cm?: number | null; height_cm?: number | null; printed_length_cm?: number | null; printed_width_cm?: number | null; printed_height_cm?: number | null }} carton
 * @param {MeasurementUnit} unit
 * @returns {string}
 */
export function cartonLabel(carton, unit) {
  const inside = formatDims(carton, unit);
  const printed = formatPrintedDims(carton, unit);
  if (printed && inside && printed !== inside) return `${carton.name} — ${printed} (inside ${inside})`;
  const dims = printed ?? inside;
  return dims ? `${carton.name} — ${dims}` : carton.name;
}
