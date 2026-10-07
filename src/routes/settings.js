import { Router } from "express";
import { db } from "../db/client.js";
import { requireRole } from "../middleware/auth.js";
import { str, defined } from "../lib/id.js";
import { parseUnit } from "../lib/units.js";

const router = Router();

router.get("/settings", requireRole("admin"), async (req, res) => {
  const result = await db.execute({
    sql: "SELECT name, default_tax_percent, measurement_unit FROM organizations WHERE id = ?",
    args: [defined(req.session.orgId)],
  });
  res.render("pages/settings", {
    title: "Settings",
    orgName: result.rows[0]?.name ?? "",
    defaultTaxPercent: result.rows[0]?.default_tax_percent ?? null,
    measurementUnit: parseUnit(result.rows[0]?.measurement_unit),
    saved: req.query.saved === "1",
    error: null,
  });
});

router.post("/settings", requireRole("admin"), async (req, res) => {
  const orgName = str(req.body.org_name).trim();
  const raw = str(req.body.default_tax_percent).trim();
  const defaultTaxPercent = raw ? parseFloat(raw) : null;
  const measurementUnit = parseUnit(str(req.body.measurement_unit));

  if (!orgName) {
    return res.render("pages/settings", {
      title: "Settings",
      orgName,
      defaultTaxPercent: raw,
      measurementUnit,
      saved: false,
      error: "Organization name is required.",
    });
  }

  if (raw && (Number.isNaN(defaultTaxPercent) || /** @type {number} */ (defaultTaxPercent) < 0)) {
    return res.render("pages/settings", {
      title: "Settings",
      orgName,
      defaultTaxPercent: raw,
      measurementUnit,
      saved: false,
      error: "Tax % must be a positive number.",
    });
  }

  await db.execute({
    sql: "UPDATE organizations SET name = ?, default_tax_percent = ?, measurement_unit = ? WHERE id = ?",
    args: [orgName, defaultTaxPercent, measurementUnit, defined(req.session.orgId)],
  });

  req.session.orgName = orgName;
  req.session.orgUnit = measurementUnit;

  res.redirect("/settings?saved=1");
});

export default router;
