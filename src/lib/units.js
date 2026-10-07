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
