import { ulid } from "ulid";
export { ulid };
export const now = () => Date.now();

/**
 * Coerce an Express param/body value (string | string[]) to a plain string.
 * @param {string | string[] | undefined} v
 * @returns {string}
 */
export const str = (v) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

/**
 * Assert a value is defined. express-session types every SessionData field as
 * optional (Partial<SessionData>) even though our augmentation declares them
 * required; requireAuth/requireRole guarantee they're set by the time routes
 * read them, so this narrows the type back for JSDoc's benefit.
 * @template T
 * @param {T | undefined} v
 * @returns {T}
 */
export const defined = (v) => /** @type {T} */ (v);
