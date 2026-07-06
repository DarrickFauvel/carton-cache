import { Router } from "express";
import argon2 from "argon2";
import { createHash, randomBytes } from "crypto";
import { db } from "../db/client.js";
import { ulid, now } from "../lib/id.js";
import { sendPasswordReset } from "../services/email.js";

/** @typedef {import("../types.js").User} User */
/** @typedef {import("../types.js").Plan} Plan */

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
  const { name, org_name, email, password, confirm } = req.body;

  const renderErr = (/** @type {string} */ error) =>
    res.render("pages/register", { title: "Create account", error });

  if (!name?.trim() || !org_name?.trim() || !email?.trim() || !password) {
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

  const orgId  = ulid();
  const userId = ulid();
  const hash   = await argon2.hash(password);
  const ts     = now();

  await db.batch([
    {
      sql: "INSERT INTO organizations (id, name, plan, created_at) VALUES (?, ?, 'free', ?)",
      args: [orgId, org_name.trim(), ts],
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
  req.session.orgName         = org_name.trim();
  req.session.orgPlan         = "free";

  res.redirect("/");
});

// ── Login ─────────────────────────────────────────────────────────────────────

router.get("/login", (req, res) => {
  if (req.session.userId) { res.redirect("/"); return; }
  res.render("pages/login", { title: "Sign in", error: null, notice: null });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await db.execute({
    sql: "SELECT u.*, o.plan AS org_plan, o.name AS org_name FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.email = ?",
    args: [email.toLowerCase().trim()],
  });

  const user = /** @type {(User & { org_plan: Plan, org_name: string }) | undefined} */ (
    /** @type {unknown} */ (result.rows[0])
  );

  if (!user || !(await argon2.verify(user.password_hash, password))) {
    res.render("pages/login", { title: "Sign in", error: "Invalid email or password.", notice: null });
    return;
  }

  req.session.userId          = user.id;
  req.session.userRole        = user.role;
  req.session.userName        = user.name;
  req.session.userLocationIds = JSON.parse(/** @type {string} */ (/** @type {unknown} */ (user.location_ids)));
  req.session.userAvatarColor = user.avatar_color ?? "color-1";
  req.session.orgId           = /** @type {string} */ (/** @type {unknown} */ (user.org_id));
  req.session.orgName         = user.org_name;
  req.session.orgPlan         = user.org_plan;

  const next = /** @type {string} */ (req.query.next) || "/";
  res.redirect(next);
});

// ── Forgot password ───────────────────────────────────────────────────────────

router.get("/forgot-password", (req, res) => {
  if (req.session.userId) { res.redirect("/"); return; }
  res.render("pages/forgot-password", { title: "Reset password", sent: false, error: null });
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  // Always show the "sent" confirmation to avoid user enumeration.
  const renderSent = () =>
    res.render("pages/forgot-password", { title: "Reset password", sent: true, error: null });

  if (!email?.trim()) {
    res.render("pages/forgot-password", { title: "Reset password", sent: false, error: "Email is required." });
    return;
  }

  const result = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [email.toLowerCase().trim()],
  });

  if (result.rows.length === 0) return renderSent();

  const userId    = /** @type {string} */ (result.rows[0].id);
  const rawToken  = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = now() + 60 * 60 * 1000; // 1 hour

  await db.execute({
    sql: "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?)",
    args: [ulid(), userId, tokenHash, expiresAt, now()],
  });

  const baseUrl  = process.env.APP_URL ?? `${req.protocol}://${req.get("host")}`;
  const resetUrl = `${baseUrl}/reset-password/${rawToken}`;

  try {
    await sendPasswordReset(email.toLowerCase().trim(), resetUrl);
  } catch (err) {
    console.error("Failed to send password reset email:", err);
  }

  renderSent();
});

// ── Reset password ────────────────────────────────────────────────────────────

router.get("/reset-password/:token", async (req, res) => {
  const tokenHash = createHash("sha256").update(req.params.token).digest("hex");

  const result = await db.execute({
    sql: "SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
    args: [tokenHash, now()],
  });

  if (result.rows.length === 0) {
    res.render("pages/reset-password", { title: "Reset password", token: null, error: "This link is invalid or has expired." });
    return;
  }

  res.render("pages/reset-password", { title: "Reset password", token: req.params.token, error: null });
});

router.post("/reset-password/:token", async (req, res) => {
  const { password, confirm } = req.body;
  const tokenHash = createHash("sha256").update(req.params.token).digest("hex");

  const renderErr = (/** @type {string} */ error) =>
    res.render("pages/reset-password", { title: "Reset password", token: req.params.token, error });

  if (!password || password.length < 8) return renderErr("Password must be at least 8 characters.");
  if (password !== confirm) return renderErr("Passwords do not match.");

  const result = await db.execute({
    sql: "SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
    args: [tokenHash, now()],
  });

  if (result.rows.length === 0) {
    return renderErr("This link is invalid or has expired. Please request a new one.");
  }

  const tokenRow = result.rows[0];
  const hash     = await argon2.hash(password);

  await db.batch([
    {
      sql: "UPDATE users SET password_hash = ? WHERE id = ?",
      args: [hash, tokenRow.user_id],
    },
    {
      sql: "UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?",
      args: [now(), tokenHash],
    },
  ]);

  res.render("pages/login", { title: "Sign in", error: null, notice: "Password updated. Please sign in." });
});

// ── Logout ────────────────────────────────────────────────────────────────────

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

export default router;
