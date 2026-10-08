import { cmToIn } from "./units.js";

/** @typedef {import("../types.js").CartonType} CartonType */

/**
 * Builds a "<source>-<size>-<LxWxH in>" label code, e.g. "ama-20-10x6x4".
 * Uses the size printed on the box so the label matches it, falling back to
 * the actual inside dimensions when no printed size is set.
 * @param {CartonType} carton
 * @returns {string | null} null if the carton is missing a source/size code or dimensions
 */
export function buildLabelCode(carton) {
  if (!carton.source_code || !carton.size_code) return null;
  const hasPrinted = carton.printed_length_cm != null && carton.printed_width_cm != null && carton.printed_height_cm != null;
  const dims = hasPrinted
    ? [carton.printed_length_cm, carton.printed_width_cm, carton.printed_height_cm]
    : [carton.length_cm, carton.width_cm, carton.height_cm];
  if (dims.some((d) => d == null)) return null;

  const [l, w, h] = dims.map((cm) => Math.round(cmToIn(Number(cm))));
  return `${carton.source_code}-${carton.size_code}-${l}x${w}x${h}`;
}
