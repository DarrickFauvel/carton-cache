/**
 * Side panel UI: set the Carton Cache URL once, then enter an item's size
 * and get the best-fitting carton (on-site first, retail catalog as a
 * fallback) with its dimensions ready to copy into eBay's package fields.
 */

import { cmToIn, inToCm, outerCm } from "../../src/lib/units.js";
import {
  ApiError,
  NotLoggedInError,
  getBaseUrl,
  getLocations,
  getMe,
  setBaseUrl,
  suggestCarton,
} from "./api.js";

/**
 * @typedef {import("../../src/types.js").CartonSuggestion} CartonSuggestion
 * @typedef {import("../../src/types.js").RetailCartonSuggestion} RetailCartonSuggestion
 */

const PREFS_KEY = "panelPrefs";

/**
 * @template {HTMLElement} T
 * @param {string} id
 * @returns {T}
 */
function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return /** @type {T} */ (el);
}

const sections = {
  setup: /** @type {HTMLElement} */ ($("setup")),
  login: /** @type {HTMLElement} */ ($("login")),
  main: /** @type {HTMLElement} */ ($("main")),
};
const who = /** @type {HTMLParagraphElement} */ ($("who"));
const changeUrl = /** @type {HTMLButtonElement} */ ($("change-url"));
const baseUrlInput = /** @type {HTMLInputElement} */ ($("base-url"));
const locationSelect = /** @type {HTMLSelectElement} */ ($("location"));
const lengthInput = /** @type {HTMLInputElement} */ ($("length"));
const widthInput = /** @type {HTMLInputElement} */ ($("width"));
const heightInput = /** @type {HTMLInputElement} */ ($("height"));
const unitSelect = /** @type {HTMLSelectElement} */ ($("unit"));
const dunnageInput = /** @type {HTMLInputElement} */ ($("dunnage"));
const dunnageUnit = /** @type {HTMLSpanElement} */ ($("dunnage-unit"));
const statusEl = /** @type {HTMLParagraphElement} */ ($("status"));
const resultsEl = /** @type {HTMLDivElement} */ ($("results"));

/** @param {"setup" | "login" | "main"} name */
function show(name) {
  for (const [key, el] of Object.entries(sections)) el.hidden = key !== name;
  changeUrl.hidden = name === "setup";
  if (name !== "main") who.hidden = true;
}

/** @param {string} message @param {boolean} [isError] */
function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

/** @param {string} origin */
function originPattern(origin) {
  return `${origin}/*`;
}

// ── Prefs (per-device conveniences) ──────────────────────────────────────────

/** @returns {Promise<{ locationId?: string; unit?: "in" | "cm" }>} */
async function loadPrefs() {
  const stored = await chrome.storage.local.get(PREFS_KEY);
  return stored[PREFS_KEY] ?? {};
}

/** @param {{ locationId?: string; unit?: "in" | "cm" }} prefs */
async function savePrefs(prefs) {
  await chrome.storage.local.set({ [PREFS_KEY]: { ...(await loadPrefs()), ...prefs } });
}

// ── Formatting ───────────────────────────────────────────────────────────────

/** @param {number} n */
const oneDecimal = (n) => String(Math.round(n * 10) / 10);

/**
 * Round up to a whole inch so the declared package is never smaller than
 * the real one. The epsilon keeps cm→in float noise (30.48 cm →
 * 12.000000000000002 in) from bumping an exact size up an inch.
 * @param {number} cm
 */
const wholeInchesUp = (cm) => Math.ceil(cmToIn(cm) - 1e-6);

/** @param {{ length_cm: number; width_cm: number; height_cm: number }} c */
const inchesLabel = (c) =>
  `${oneDecimal(cmToIn(c.length_cm))}\u2009×\u2009${oneDecimal(cmToIn(c.width_cm))}\u2009×\u2009${oneDecimal(cmToIn(c.height_cm))} in`;

/**
 * An on-site carton's size: what's printed on the box, plus the actual
 * inside size when that differs.
 * @param {CartonSuggestion} c
 */
function onSiteSizeLabel(c) {
  const inside = inchesLabel(c);
  if (c.printed_length_cm == null || c.printed_width_cm == null || c.printed_height_cm == null) return inside;
  const printed = inchesLabel({ length_cm: c.printed_length_cm, width_cm: c.printed_width_cm, height_cm: c.printed_height_cm });
  return printed === inside ? printed : `${printed} (inside ${inside})`;
}

/** @param {{ length_cm: number; width_cm: number; height_cm: number }} c */
const ebayDims = (c) => `${wholeInchesUp(c.length_cm)} x ${wholeInchesUp(c.width_cm)} x ${wholeInchesUp(c.height_cm)}`;

// ── Rendering ────────────────────────────────────────────────────────────────

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {{ length_cm: number; width_cm: number; height_cm: number }} carton */
function copyButton(carton) {
  const dims = ebayDims(carton);
  const button = /** @type {HTMLButtonElement} */ (el("button", "secondary", "Copy"));
  button.type = "button";
  button.title = `Copy "${dims}" (inches, rounded up)`;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(dims);
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = "Copy"), 1500);
    } catch {
      setStatus(`Couldn't copy. Package size: ${dims} in`, true);
    }
  });
  return button;
}

/**
 * Whole-inch height to cut a resizable carton down to, or null when the
 * cut wouldn't change its whole-inch height (so isn't worth suggesting).
 * @param {CartonSuggestion} c
 */
function cutHeightIn(c) {
  if (c.resize_height_cm == null) return null;
  const cut = wholeInchesUp(c.resize_height_cm);
  return cut < wholeInchesUp(c.height_cm) ? cut : null;
}

/** @param {CartonSuggestion} c */
function onSiteCard(c) {
  const card = el("div", "card");
  const cut = cutHeightIn(c);
  // Package dims as shipped: outer size (actual inside plus a wall on each
  // side), and after cutting, the height is the cut height.
  const insideHeightCm = cut == null ? c.height_cm : inToCm(cut);
  const shipped = {
    length_cm: outerCm(c.length_cm, c.wall_thickness_cm),
    width_cm:  outerCm(c.width_cm, c.wall_thickness_cm),
    height_cm: outerCm(insideHeightCm, c.wall_thickness_cm),
  };
  card.append(el("div", "name", c.name));
  if (c.label_code) card.append(el("div", "label-code", c.label_code));
  card.append(el("div", "meta", `${onSiteSizeLabel(c)} · ${c.quantity} in stock`));
  if (cut != null) card.append(el("div", "cut", `Cut height down to ${cut} in`));
  card.append(el("div", "meta", `eBay: ${ebayDims(shipped)}`), copyButton(shipped));
  return card;
}

/** @param {RetailCartonSuggestion} c */
function retailCard(c) {
  const card = el("div", "card");
  const where = c.city ? `${c.store_name}, ${c.city}` : c.store_name;
  const cost = c.cost != null ? ` · $${c.cost.toFixed(2)}` : "";
  card.append(
    el("div", "name", c.sku ? `${c.name} (${c.sku})` : c.name),
    el("div", "meta", `${inchesLabel(c)} · eBay: ${ebayDims(c)}`),
    el("div", "meta", `${where}${cost}`),
    copyButton(c)
  );
  return card;
}

/** @param {{ onSite: CartonSuggestion[]; retail: RetailCartonSuggestion[] }} result */
function renderResults(result) {
  resultsEl.replaceChildren();
  if (result.onSite.length > 0) {
    resultsEl.append(el("h2", undefined, "In stock"), ...result.onSite.map(onSiteCard));
    setStatus("");
  } else if (result.retail.length > 0) {
    resultsEl.append(el("h2", undefined, "Buy from a store"), ...result.retail.map(retailCard));
    setStatus("Nothing in stock fits. These store cartons do:");
  } else {
    setStatus("No carton fits this item, in stock or in the store catalog.");
  }
}

// ── Flow ─────────────────────────────────────────────────────────────────────

async function loadLocations() {
  const [locations, prefs] = await Promise.all([getLocations(), loadPrefs()]);
  locationSelect.replaceChildren(new Option("All locations", ""));
  for (const loc of locations) locationSelect.append(new Option(loc.name, loc.id));
  if (prefs.locationId && locations.some((l) => l.id === prefs.locationId)) {
    locationSelect.value = prefs.locationId;
  }
  if (prefs.unit) setUnit(prefs.unit);
}

/** Checks login and shows the right section. */
async function refresh() {
  const base = await getBaseUrl();
  if (!base || !(await chrome.permissions.contains({ origins: [originPattern(base)] }))) {
    baseUrlInput.value = base ?? "";
    show("setup");
    return;
  }
  try {
    const me = await getMe();
    who.textContent = `${me.name} · ${me.orgName}`;
    who.hidden = false;
    show("main");
    await loadLocations();
  } catch (err) {
    if (err instanceof NotLoggedInError) {
      show("login");
    } else {
      show("main");
      setStatus(`Can't reach Carton Cache: ${err instanceof Error ? err.message : err}`, true);
    }
  }
}

/** @type {"in" | "cm"} */
let currentUnit = "in";

/**
 * Switches the input unit, converting the padding value so it stays the
 * same physical size.
 * @param {"in" | "cm"} unit
 */
function setUnit(unit) {
  const dunnage = parseFloat(dunnageInput.value);
  if (unit !== currentUnit && Number.isFinite(dunnage)) {
    dunnageInput.value = oneDecimal(unit === "cm" ? inToCm(dunnage) : cmToIn(dunnage));
  }
  currentUnit = unit;
  unitSelect.value = unit;
  dunnageUnit.textContent = unit;
}

$("setup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let origin;
  try {
    origin = new URL(baseUrlInput.value.trim()).origin;
  } catch {
    return setStatus("That doesn't look like a URL.", true);
  }
  // Request permission first, while the click still counts as a user gesture.
  const granted = await chrome.permissions.request({ origins: [originPattern(origin)] });
  if (!granted) return;
  await setBaseUrl(origin);
  await refresh();
});

$("login-button").addEventListener("click", async () => {
  const base = await getBaseUrl();
  if (base) await chrome.tabs.create({ url: `${base}/login` });
});

changeUrl.addEventListener("click", async () => {
  baseUrlInput.value = (await getBaseUrl()) ?? "";
  show("setup");
});

// Coming back to the panel: re-check login if we were waiting on it, or
// reload locations so ones added (or assigned) since the panel opened show up.
window.addEventListener("focus", () => {
  if (!sections.login.hidden) {
    refresh();
  } else if (!sections.main.hidden) {
    loadLocations().catch((err) => {
      if (err instanceof NotLoggedInError) refresh();
    });
  }
});

unitSelect.addEventListener("change", () => {
  const unit = unitSelect.value === "cm" ? "cm" : "in";
  setUnit(unit);
  savePrefs({ unit });
});

locationSelect.addEventListener("change", () => savePrefs({ locationId: locationSelect.value }));

$("suggest-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const toCm = currentUnit === "cm" ? (/** @type {number} */ n) => n : inToCm;
  const [l, w, h] = [lengthInput, widthInput, heightInput].map((i) => parseFloat(i.value));
  const dunnage = parseFloat(dunnageInput.value || "0");
  if (![l, w, h].every((n) => Number.isFinite(n) && n > 0)) {
    return setStatus("Enter the item's length, width and height.", true);
  }
  if (!Number.isFinite(dunnage) || dunnage < 0) {
    return setStatus("Padding can't be negative.", true);
  }

  setStatus("Finding a carton…");
  resultsEl.replaceChildren();
  try {
    renderResults(
      await suggestCarton({
        lengthCm: toCm(l),
        widthCm: toCm(w),
        heightCm: toCm(h),
        dunnageCm: toCm(dunnage),
        locationId: locationSelect.value || undefined,
      })
    );
  } catch (err) {
    if (err instanceof NotLoggedInError) return show("login");
    setStatus(err instanceof ApiError || err instanceof Error ? err.message : String(err), true);
  }
});

refresh();
