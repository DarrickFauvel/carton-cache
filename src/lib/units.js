/** @typedef {import("../types.js").MeasurementUnit} MeasurementUnit */

export const CM_PER_INCH = 2.54;

/** @type {MeasurementUnit} */
export const DEFAULT_UNIT = "in";

/** @param {number} inches @returns {number} */
export const inToCm = (inches) => inches * CM_PER_INCH;

/** @param {number} cm @returns {number} */
export const cmToIn = (cm) => cm / CM_PER_INCH;

/**
 * Anything other than "cm" falls back to the default (imperial).
 * @param {unknown} value
 * @returns {MeasurementUnit}
 */
export const parseUnit = (value) => (value === "cm" ? "cm" : DEFAULT_UNIT);

/** @param {number} value @param {MeasurementUnit} unit @returns {number} */
export const toCm = (value, unit) => (unit === "cm" ? value : inToCm(value));

/**
 * Convert a stored cm value for display, rounded to 2 decimals so float noise
 * (30.48 cm → 12.000000000000002 in) doesn't leak into the UI.
 * @param {number} cm
 * @param {MeasurementUnit} unit
 * @returns {number}
 */
export const fromCm = (cm, unit) => Math.round((unit === "cm" ? cm : cmToIn(cm)) * 100) / 100;

/**
 * "L × W × H unit" (thin spaces around ×, for plain-text contexts like <option>; HTML views use .dim-x instead) for a carton with stored cm dimensions, or null if any
 * dimension is missing.
 * @param {{ length_cm?: number | null; width_cm?: number | null; height_cm?: number | null }} carton
 * @param {MeasurementUnit} unit
 * @returns {string | null}
 */
export function formatDims(carton, unit) {
  const dims = [carton.length_cm, carton.width_cm, carton.height_cm];
  if (dims.some((d) => d == null)) return null;
  return `${dims.map((cm) => fromCm(Number(cm), unit)).join("\u2009×\u2009")} ${unit}`;
}

/**
 * How a carton type is named in pickers and lists: its name plus its
 * dimensions, which tell cartons apart better than the SKU does.
 * @param {{ name: string; length_cm?: number | null; width_cm?: number | null; height_cm?: number | null }} carton
 * @param {MeasurementUnit} unit
 * @returns {string}
 */
export function cartonLabel(carton, unit) {
  const dims = formatDims(carton, unit);
  return dims ? `${carton.name} — ${dims}` : carton.name;
}
