/**
 * GS1-128 Application Identifier parser.
 *
 * Handles three input formats:
 *  - Human-readable with parentheses: "(01)12345678901234(30)24(10)LOT-A"
 *  - Machine-readable with GS separators (ASCII 29): "01123456789012343024\x1d10LOT-A"
 *  - Plain barcode (not GS1): returned as-is with no AIs parsed
 *
 * AIs covered: GTIN (01/02), lot (10), expiry (17), serial (21), quantity (30/37).
 */

const GS = "\x1d"; // Group Separator — variable-length AI terminator

// Fixed-length AI definitions (digits of data after the AI digits)
/** @type {Record<string, number>} */
const FIXED = {
  "00": 18, // SSCC
  "01": 14, // GTIN
  "02": 14, // GTIN of contained items
  "11": 6,  // Production date YYMMDD
  "13": 6,  // Packaging date
  "15": 6,  // Best-before date
  "17": 6,  // Expiry date
  "20": 2,  // Product variant
};

// Variable-length AIs we care about (all others are ignored)
const VARIABLE = new Set(["10", "21", "30", "37", "310", "311", "320", "321"]);

/**
 * @typedef {object} GS1Data
 * @property {string} [gtin] GTIN-14 from AI 01 or 02
 * @property {string} [lot] Lot / batch number from AI 10
 * @property {string} [expiry] Expiry date string (YYMMDD) from AI 17
 * @property {string} [serial] Serial number from AI 21
 * @property {number} [quantity] Pack quantity from AI 30 or 37
 * @property {string} raw The original raw string as received from the scanner
 */

/**
 * @param {string} raw
 * @returns {GS1Data}
 */
export function parseGS1(raw) {
  /** @type {GS1Data} */
  const result = { raw };

  // Strip AIM symbology identifier prefix (e.g. ]C1 for GS1-128)
  let s = raw;
  if (/^\][A-Za-z]\d/.test(s)) s = s.slice(3);

  // ── Human-readable format: (AI)value(AI)value… ───────────────────────────
  if (/^\(\d{2}/.test(s)) {
    const re = /\((\d{2,4})\)([^(]*)/g;
    /** @type {RegExpExecArray | null} */
    let m;
    while ((m = re.exec(s)) !== null) {
      applyAI(result, m[1], m[2].trim());
    }
    return result;
  }

  // ── Machine-readable format ───────────────────────────────────────────────
  // Presence of GS character or a known fixed-length AI at position 0
  // strongly suggests GS1 machine format.
  const looksLikeGS1 = s.includes(GS) || FIXED[s.slice(0, 2)] !== undefined;
  if (!looksLikeGS1) return result; // plain barcode — nothing to parse

  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) { i++; continue; }

    // Try 2-digit AI
    const ai2 = s.slice(i, i + 2);
    const fixedLen = FIXED[ai2];

    if (fixedLen !== undefined) {
      i += 2;
      applyAI(result, ai2, s.slice(i, i + fixedLen));
      i += fixedLen;
    } else if (VARIABLE.has(ai2)) {
      i += 2;
      const sep = s.indexOf(GS, i);
      const value = sep === -1 ? s.slice(i) : s.slice(i, sep);
      applyAI(result, ai2, value);
      i = sep === -1 ? s.length : sep + 1;
    } else {
      break; // unknown AI — stop parsing
    }
  }

  return result;
}

/**
 * @param {GS1Data} out
 * @param {string} ai
 * @param {string} value
 */
function applyAI(out, ai, value) {
  switch (ai) {
    case "01":
    case "02":
      out.gtin = value;
      break;
    case "10":
      out.lot = value;
      break;
    case "17":
      out.expiry = formatExpiry(value);
      break;
    case "21":
      out.serial = value;
      break;
    case "30":
    case "37": {
      const n = parseInt(value, 10);
      if (!isNaN(n) && n > 0) out.quantity = n;
      break;
    }
  }
}

/**
 * Convert YYMMDD → YYYY-MM-DD
 * @param {string} yymmdd
 * @returns {string}
 */
function formatExpiry(yymmdd) {
  if (yymmdd.length !== 6) return yymmdd;
  const yy = yymmdd.slice(0, 2);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const year = parseInt(yy, 10) >= 50 ? `19${yy}` : `20${yy}`;
  return `${year}-${mm}-${dd}`;
}
