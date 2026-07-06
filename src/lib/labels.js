import { cmToIn } from "./units.js";

/** @typedef {import("../types.js").CartonType} CartonType */

/**
 * Builds a "<source>-<size>-<LxWxH in>" label code, e.g. "ama-20-10x6x4".
 * @param {CartonType} carton
 * @returns {string | null} null if the carton is missing a source/size code or dimensions
 */
export function buildLabelCode(carton) {
  if (!carton.source_code || !carton.size_code) return null;
  if (carton.length_cm == null || carton.width_cm == null || carton.height_cm == null) return null;

  const l = Math.round(cmToIn(carton.length_cm));
  const w = Math.round(cmToIn(carton.width_cm));
  const h = Math.round(cmToIn(carton.height_cm));
  return `${carton.source_code}-${carton.size_code}-${l}x${w}x${h}`;
}
