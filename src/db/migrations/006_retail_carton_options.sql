-- Standalone catalog of cartons available for pickup at retail stores
-- (Walmart, Staples, etc.) when on-site stock runs short. Intentionally
-- NOT linked to carton_types — this is a reference list, not inventory.

CREATE TABLE IF NOT EXISTS retail_carton_options (
  id         TEXT    PRIMARY KEY,
  store_name TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  sku        TEXT,
  length_cm  REAL,
  width_cm   REAL,
  height_cm  REAL,
  weight_lb  REAL,
  cost       REAL,
  notes      TEXT,
  created_at INTEGER NOT NULL,
  org_id     TEXT    NOT NULL DEFAULT '01JDEFAULTORG0000000000001',
  UNIQUE (org_id, store_name, sku)
);

CREATE INDEX IF NOT EXISTS idx_retail_carton_options_org   ON retail_carton_options (org_id);
CREATE INDEX IF NOT EXISTS idx_retail_carton_options_store ON retail_carton_options (org_id, store_name);
