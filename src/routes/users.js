import { Router } from "express";
import argon2 from "argon2";
import { db } from "../db/client.js";
import { requireRole } from "../middleware/auth.js";
import { ulid, now, defined } from "../lib/id.js";

/** @typedef {import("../types.js").User} User */
/** @typedef {import("../types.js").Role} Role */

const router = Router();

router.get("/users", requireRole("admin"), async (req, res) => {
  const result = await db.execute({ sql: "SELECT id, name, email, role, created_at FROM users WHERE org_id = ? ORDER BY created_at ASC", args: [defined(req.session.orgId)] });
  res.render("pages/users", {
    title: "Users",
    users: /** @type {Pick<User, "id" | "name" | "email" | "role" | "created_at">[]} */ (
      /** @type {unknown} */ (result.rows)
    ),
  });
});

router.get("/users/new", requireRole("admin"), (_req, res) => {
  res.render("pages/users-new", { title: "Add user", error: null });
});

router.post("/users", requireRole("admin"), async (req, res) => {
  const { name, email, password, role } = req.body;

  const renderErr = (/** @type {string} */ error) =>
    res.render("pages/users-new", { title: "Add user", error });

  /** @type {Role[]} */
  const validRoles = ["admin", "manager", "staff", "viewer"];
  if (!name?.trim() || !email?.trim() || !password || !validRoles.includes(role)) {
    return renderErr("All fields are required.");
  }
  if (password.length < 8) {
    return renderErr("Password must be at least 8 characters.");
  }

  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [email.toLowerCase().trim()],
  });
  if (existing.rows.length > 0) {
    return renderErr("A user with that email already exists.");
  }

  const hash = await argon2.hash(password);
  await db.execute({
    sql: "INSERT INTO users (id, email, name, password_hash, role, location_ids, org_id, created_at) VALUES (?,?,?,?,?,?,?,?)",
    args: [ulid(), email.toLowerCase().trim(), name.trim(), hash, role, "[]", defined(req.session.orgId), now()],
  });

  res.redirect("/users");
});

export default router;
