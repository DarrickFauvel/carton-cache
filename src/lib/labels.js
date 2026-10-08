import { cmToIn } from "./units.js";

/** @typedef {import("../types.js").CartonType} CartonType */

/**
 * Formats a "<LxWxH in>-<source>" label code, e.g. "10x6x4-ama", with the
 * source lowercased. Shared with the carton form's live preview (src/components/label-preview.js).
 * @param {string | null} sourceCode
 * @param {(number | null)[]} dimsCm length, width, height
 * @returns {string | null} null if the source code or any dimension is missing
 */
export function formatLabelCode(sourceCode, dimsCm) {
  if (!sourceCode || dimsCm.some((d) => d == null || !Number.isFinite(d))) return null;
  const [l, w, h] = dimsCm.map((cm) => Math.round(cmToIn(Number(cm))));
  return `${l}x${w}x${h}-${sourceCode.toLowerCase()}`;
}

/**
 * Builds a carton's label code. Uses the size printed on the box so the label
 * matches it, falling back to the actual inside dimensions when no printed
 * size is set.
 * @param {CartonType} carton
 * @returns {string | null} null if the carton is missing a source code or dimensions
 */
export function buildLabelCode(carton) {
  const hasPrinted = carton.printed_length_cm != null && carton.printed_width_cm != null && carton.printed_height_cm != null;
  const dims = hasPrinted
    ? [carton.printed_length_cm, carton.printed_width_cm, carton.printed_height_cm]
    : [carton.length_cm, carton.width_cm, carton.height_cm];
  return formatLabelCode(carton.source_code, dims);
}
