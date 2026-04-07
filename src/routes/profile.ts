import { Router } from "express";
import argon2 from "argon2";
import { db } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const VALID_COLORS = [
  "color-1", "color-2", "color-3", "color-4",
  "color-5", "color-6", "color-7", "color-8",
];

router.get("/profile", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: "SELECT id, name, email, role, avatar_color FROM users WHERE id = ?",
    args: [req.session.userId!],
  });
  res.render("pages/profile", {
    title: "Profile",
    record: result.rows[0],
    saved: req.query.saved === "1",
    error: null,
  });
});

router.post("/profile", requireAuth, async (req, res) => {
  const { name, avatar_color, current_password, new_password, confirm_password } = req.body as Record<string, string>;

  const renderErr = async (error: string) => {
    const result = await db.execute({
      sql: "SELECT id, name, email, role, avatar_color FROM users WHERE id = ?",
      args: [req.session.userId!],
    });
    res.render("pages/profile", { title: "Profile", record: result.rows[0], saved: false, error });
  };

  if (!name?.trim()) return renderErr("Name is required.");
  if (!VALID_COLORS.includes(avatar_color)) return renderErr("Invalid color selection.");

  // Optional password change
  if (current_password || new_password || confirm_password) {
    const userResult = await db.execute({
      sql: "SELECT password_hash FROM users WHERE id = ?",
      args: [req.session.userId!],
    });
    const hash = userResult.rows[0]?.password_hash as string;
    if (!await argon2.verify(hash, current_password)) return renderErr("Current password is incorrect.");
    if (!new_password || new_password.length < 8) return renderErr("New password must be at least 8 characters.");
    if (new_password !== confirm_password) return renderErr("New passwords do not match.");

    const newHash = await argon2.hash(new_password);
    await db.execute({
      sql: "UPDATE users SET name = ?, avatar_color = ?, password_hash = ? WHERE id = ?",
      args: [name.trim(), avatar_color, newHash, req.session.userId!],
    });
  } else {
    await db.execute({
      sql: "UPDATE users SET name = ?, avatar_color = ? WHERE id = ?",
      args: [name.trim(), avatar_color, req.session.userId!],
    });
  }

  req.session.userName        = name.trim();
  req.session.userAvatarColor = avatar_color;

  res.redirect("/profile?saved=1");
});

export default router;
