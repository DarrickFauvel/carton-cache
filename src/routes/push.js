import { Router } from "express";
import webpush from "web-push";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { ulid, now, defined } from "../lib/id.js";

const router = Router();

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL ?? "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/** Return the VAPID public key so the client can subscribe. */
router.get("/vapid-public-key", (_req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY ?? null });
});

/** Store a new push subscription for the current user. */
router.post("/subscribe", requireAuth, async (req, res) => {
  const { endpoint, keys } = req.body;
  await db.execute({
    sql: `
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (endpoint) DO NOTHING
    `,
    args: [ulid(), defined(req.session.userId), endpoint, keys.p256dh, keys.auth, now()],
  });
  res.json({ ok: true });
});

/** Remove a push subscription (unsubscribe). */
router.post("/unsubscribe", requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  await db.execute({
    sql: "DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?",
    args: [endpoint, defined(req.session.userId)],
  });
  res.json({ ok: true });
});

export default router;
