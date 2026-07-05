import { Router } from "express";
import { db } from "../db/client.js";
import { requireRole } from "../middleware/auth.js";
import { str } from "../lib/id.js";

const router = Router();

router.get("/settings", requireRole("admin"), async (req, res) => {
  const result = await db.execute({
    sql: "SELECT default_tax_percent FROM organizations WHERE id = ?",
    args: [req.session.orgId!],
  });
  res.render("pages/settings", {
    title: "Settings",
    defaultTaxPercent: result.rows[0]?.default_tax_percent ?? null,
    saved: req.query.saved === "1",
    error: null,
  });
});

router.post("/settings", requireRole("admin"), async (req, res) => {
  const raw = str(req.body.default_tax_percent).trim();
  const defaultTaxPercent = raw ? parseFloat(raw) : null;

  if (raw && (Number.isNaN(defaultTaxPercent!) || defaultTaxPercent! < 0)) {
    return res.render("pages/settings", {
      title: "Settings",
      defaultTaxPercent: raw,
      saved: false,
      error: "Tax % must be a positive number.",
    });
  }

  await db.execute({
    sql: "UPDATE organizations SET default_tax_percent = ? WHERE id = ?",
    args: [defaultTaxPercent, req.session.orgId!],
  });

  res.redirect("/settings?saved=1");
});

export default router;
