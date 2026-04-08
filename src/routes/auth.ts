import { Router } from "express";
import argon2 from "argon2";
import { db } from "../db/client.js";
import { ulid, now } from "../lib/id.js";
import type { User, Plan } from "../types.js";

const router = Router();

// ── Welcome / landing ─────────────────────────────────────────────────────────

router.get("/", async (req, res, next) => {
  if (req.session.userId) return next();
  res.render("pages/welcome", { title: "Carton Cache" });
});

// ── Register ──────────────────────────────────────────────────────────────────

router.get("/register", (req, res) => {
  if (req.session.userId) { res.redirect("/"); return; }
  res.render("pages/register", { title: "Create account", error: null });
});

router.post("/register", async (req, res) => {
  const { name, email, password, confirm } = req.body as {
    name: string; email: string; password: string; confirm: string;
  };

  const renderErr = (error: string) =>
    res.render("pages/register", { title: "Create account", error });

  if (!name?.trim() || !email?.trim() || !password) {
    return renderErr("All fields are required.");
  }
  if (password.length < 8) {
    return renderErr("Password must be at least 8 characters.");
  }
  if (password !== confirm) {
    return renderErr("Passwords do not match.");
  }

  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [email.toLowerCase().trim()],
  });
  if (existing.rows.length > 0) {
    return renderErr("An account with that email already exists.");
  }

  const orgId   = ulid();
  const userId  = ulid();
  const hash    = await argon2.hash(password);
  const ts      = now();
  const orgName = `${name.trim()}'s workspace`;

  await db.batch([
    {
      sql: "INSERT INTO organizations (id, name, plan, created_at) VALUES (?, ?, 'free', ?)",
      args: [orgId, orgName, ts],
    },
    {
      sql: "INSERT INTO users (id, email, name, password_hash, role, location_ids, avatar_color, org_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      args: [userId, email.toLowerCase().trim(), name.trim(), hash, "admin", "[]", "color-1", orgId, ts],
    },
  ]);

  req.session.userId          = userId;
  req.session.userRole        = "admin";
  req.session.userName        = name.trim();
  req.session.userLocationIds = [];
  req.session.userAvatarColor = "color-1";
  req.session.orgId           = orgId;
  req.session.orgPlan         = "free";

  res.redirect("/");
});

// ── Login ─────────────────────────────────────────────────────────────────────

router.get("/login", (req, res) => {
  if (req.session.userId) { res.redirect("/"); return; }
  res.render("pages/login", { title: "Sign in", error: null });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const result = await db.execute({
    sql: "SELECT u.*, o.plan AS org_plan FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.email = ?",
    args: [email.toLowerCase().trim()],
  });

  const user = result.rows[0] as unknown as (User & { org_plan: Plan }) | undefined;

  if (!user || !(await argon2.verify(user.password_hash, password))) {
    res.render("pages/login", { title: "Sign in", error: "Invalid email or password." });
    return;
  }

  req.session.userId          = user.id;
  req.session.userRole        = user.role;
  req.session.userName        = user.name;
  req.session.userLocationIds = JSON.parse(user.location_ids as unknown as string);
  req.session.userAvatarColor = user.avatar_color ?? "color-1";
  req.session.orgId           = user.org_id as unknown as string;
  req.session.orgPlan         = user.org_plan;

  const next = (req.query.next as string) || "/";
  res.redirect(next);
});

// ── Logout ────────────────────────────────────────────────────────────────────

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

export default router;
