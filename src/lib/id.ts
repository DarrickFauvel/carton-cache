import { ulid } from "ulid";
export { ulid };
export const now = () => Date.now();

/** Coerce an Express param/body value (string | string[]) to a plain string. */
export const str = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
