-- Carton types now default to a unit cost of 0 instead of NULL (see
-- parseCartonBody in src/routes/cartons.js). Backfill older rows so reports,
-- which skip NULL costs, treat them the same as newly saved ones.
UPDATE carton_types SET unit_cost = 0 WHERE unit_cost IS NULL;
