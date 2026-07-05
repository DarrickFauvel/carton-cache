import { defined } from "../lib/id.js";

/** @typedef {import("../types.js").Role} Role */

/**
 * Require an authenticated session. Redirects to /login if not present.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function requireAuth(req, res, next) {
  if (!req.session.userId) {
    res.redirect(`/login?next=${encodeURIComponent(req.path)}`);
    return;
  }
  next();
}

/**
 * Require a minimum role level.
 * @param {...Role} roles
 */
export function requireRole(...roles) {
  return (
    /** @type {import("express").Request} */ req,
    /** @type {import("express").Response} */ res,
    /** @type {import("express").NextFunction} */ next
  ) => {
    if (!req.session.userId) {
      res.redirect(`/login?next=${encodeURIComponent(req.path)}`);
      return;
    }
    if (!roles.includes(defined(req.session.userRole))) {
      res.status(403).render("pages/error", {
        title: "Forbidden",
        message: "You don't have permission to access this page.",
      });
      return;
    }
    next();
  };
}

/**
 * Derive two-letter initials from a display name.
 * @param {string} name
 * @returns {string}
 */
export function toInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (parts[0] ?? "?").slice(0, 2).toUpperCase();
}

/**
 * Attach session user data to res.locals for use in templates.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function locals(req, res, next) {
  res.locals.path = req.path;
  res.locals.user = req.session.userId
    ? {
        id: req.session.userId,
        name: req.session.userName,
        role: req.session.userRole,
        locationIds: req.session.userLocationIds,
        avatarColor: req.session.userAvatarColor ?? "color-1",
        initials: toInitials(req.session.userName ?? "?"),
        orgId: req.session.orgId,
        orgPlan: req.session.orgPlan ?? "free",
      }
    : null;
  next();
}
