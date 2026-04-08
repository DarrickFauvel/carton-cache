import type { Request, Response, NextFunction } from "express";
import type { Role } from "../types.js";

/** Require an authenticated session. Redirects to /login if not present. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.redirect(`/login?next=${encodeURIComponent(req.path)}`);
    return;
  }
  next();
}

/** Require a minimum role level. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      res.redirect(`/login?next=${encodeURIComponent(req.path)}`);
      return;
    }
    if (!roles.includes(req.session.userRole as Role)) {
      res.status(403).render("pages/error", {
        title: "Forbidden",
        message: "You don't have permission to access this page.",
      });
      return;
    }
    next();
  };
}

/** Derive two-letter initials from a display name. */
export function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (parts[0] ?? "?").slice(0, 2).toUpperCase();
}

/** Attach session user data to res.locals for use in templates. */
export function locals(req: Request, res: Response, next: NextFunction) {
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
