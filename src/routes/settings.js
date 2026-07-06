import { Router } from "express";
import { db } from "../db/client.js";
import { requireRole } from "../middleware/auth.js";
import { str, defined } from "../lib/id.js";

const router = Router();

router.get("/settings", requireRole("admin"), async (req, res) => {
  const result = await db.execute({
    sql: "SELECT name, default_tax_percent FROM organizations WHERE id = ?",
    args: [defined(req.session.orgId)],
  });
  res.render("pages/settings", {
    title: "Settings",
    orgName: result.rows[0]?.name ?? "",
    defaultTaxPercent: result.rows[0]?.default_tax_percent ?? null,
    saved: req.query.saved === "1",
    error: null,
  });
});

router.post("/settings", requireRole("admin"), async (req, res) => {
  const orgName = str(req.body.org_name).trim();
  const raw = str(req.body.default_tax_percent).trim();
  const defaultTaxPercent = raw ? parseFloat(raw) : null;

  if (!orgName) {
    return res.render("pages/settings", {
      title: "Settings",
      orgName,
      defaultTaxPercent: raw,
      saved: false,
      error: "Organization name is required.",
    });
  }

  if (raw && (Number.isNaN(defaultTaxPercent) || /** @type {number} */ (defaultTaxPercent) < 0)) {
    return res.render("pages/settings", {
      title: "Settings",
      orgName,
      defaultTaxPercent: raw,
      saved: false,
      error: "Tax % must be a positive number.",
    });
  }

  await db.execute({
    sql: "UPDATE organizations SET name = ?, default_tax_percent = ? WHERE id = ?",
    args: [orgName, defaultTaxPercent, defined(req.session.orgId)],
  });

  req.session.orgName = orgName;

  res.redirect("/settings?saved=1");
});

export default router;
