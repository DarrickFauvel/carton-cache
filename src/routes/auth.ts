import { Router } from "express";
import argon2 from "argon2";
import { db } from "../db/client.js";
import { ulid, now } from "../lib/id.js";
import type { User } from "../types.js";

const router = Router();

async function userCount(): Promise<number> {
  const r = await db.execute("SELECT COUNT(*) AS n FROM users");
  return Number(r.rows[0]?.n ?? 0);
}

router.get("/login", async (req, res) => {
  if (req.session.userId) {
    res.redirect("/");
    return;
  }
  const firstRun = (await userCount()) === 0;
  res.render("pages/login", { title: "Sign in", error: null, firstRun });
});

router.get("/register", async (req, res) => {
  if (req.session.userId) { res.redirect("/"); return; }
  if ((await userCount()) > 0) { res.redirect("/login"); return; }
  res.render("pages/register", { title: "Create account", error: null });
});

router.post("/register", async (req, res) => {
  if ((await userCount()) > 0) { res.redirect("/login"); return; }

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

  const hash = await argon2.hash(password);
  const id   = ulid();

  await db.execute({
    sql: "INSERT INTO users (id, email, name, password_hash, role, location_ids, avatar_color, created_at) VALUES (?,?,?,?,?,?,?,?)",
    args: [id, email.toLowerCase().trim(), name.trim(), hash, "admin", "[]", "color-1", now()],
  });

  req.session.userId          = id;
  req.session.userRole        = "admin";
  req.session.userName        = name.trim();
  req.session.userLocationIds = [];
  req.session.userAvatarColor = "color-1";
  res.redirect("/");
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const result = await db.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [email.toLowerCase().trim()],
  });

  const user = result.rows[0] as unknown as User | undefined;

  if (!user || !(await argon2.verify(user.password_hash, password))) {
    res.render("pages/login", {
      title: "Sign in",
      error: "Invalid email or password.",
    });
    return;
  }

  req.session.userId          = user.id;
  req.session.userRole        = user.role;
  req.session.userName        = user.name;
  req.session.userLocationIds = JSON.parse(user.location_ids as unknown as string);
  req.session.userAvatarColor = user.avatar_color ?? "color-1";

  const next = (req.query.next as string) || "/";
  res.redirect(next);
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

export default router;
