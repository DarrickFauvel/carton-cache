/**
 * Thin client for the Carton Cache JSON API (src/routes/api.js). Requests
 * ride on the user's normal Carton Cache session cookie, so the user logs in
 * through the web app itself; the extension never sees a password.
 */

/** @typedef {import("../../src/types.js").SuggestCartonResult} SuggestCartonResult */

/**
 * @typedef {object} Me
 * @property {string} name
 * @property {string} role
 * @property {string} orgName
 */

/**
 * @typedef {object} LocationOption
 * @property {string} id
 * @property {string} name
 */

const BASE_URL_KEY = "baseUrl";

export class NotLoggedInError extends Error {}

export class ApiError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** @returns {Promise<string | null>} */
export async function getBaseUrl() {
  const stored = await chrome.storage.sync.get(BASE_URL_KEY);
  const value = stored[BASE_URL_KEY];
  return typeof value === "string" ? value : null;
}

/**
 * Normalizes to an origin (no trailing path) and persists it. Throws on an
 * unparseable or non-http(s) URL.
 * @param {string} input
 * @returns {Promise<string>}
 */
export async function setBaseUrl(input) {
  const url = new URL(input.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("URL must start with http:// or https://");
  }
  await chrome.storage.sync.set({ [BASE_URL_KEY]: url.origin });
  return url.origin;
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<unknown>}
 */
async function request(path, init) {
  const base = await getBaseUrl();
  if (!base) throw new Error("Carton Cache URL is not set.");
  const res = await fetch(base + path, { credentials: "include", ...init });
  if (res.status === 401) throw new NotLoggedInError();
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body && typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body;
}

/** @returns {Promise<Me>} */
export async function getMe() {
  return /** @type {Me} */ (await request("/api/me"));
}

/** @returns {Promise<LocationOption[]>} */
export async function getLocations() {
  return /** @type {LocationOption[]} */ (await request("/api/locations"));
}

/**
 * @param {{ lengthCm: number; widthCm: number; heightCm: number; dunnageCm: number; locationId?: string }} args
 * @returns {Promise<SuggestCartonResult>}
 */
export async function suggestCarton(args) {
  const params = new URLSearchParams({
    length_cm: String(args.lengthCm),
    width_cm: String(args.widthCm),
    height_cm: String(args.heightCm),
    dunnage_cm: String(args.dunnageCm),
  });
  if (args.locationId) params.set("location_id", args.locationId);
  return /** @type {SuggestCartonResult} */ (await request(`/api/cartons/suggest?${params}`));
}
