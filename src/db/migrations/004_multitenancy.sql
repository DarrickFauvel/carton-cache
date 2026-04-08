-- Multi-tenancy: every sign-up gets its own isolated organization.
-- plan = 'free'  → 1 location max
-- plan = 'pro'   → unlimited (paid, wired up later)
--
-- Run order matters: ADD COLUMN statements come first so that re-runs
-- bail out immediately on "duplicate column name" before any RENAME/CREATE.

CREATE TABLE IF NOT EXISTS organizations (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  plan       TEXT    NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro')),
  created_at INTEGER NOT NULL
);

-- Seed a default org for existing data; give it pro so nothing breaks.
INSERT OR IGNORE INTO organizations (id, name, plan, created_at)
VALUES ('01JDEFAULTORG0000000000001', 'Default', 'pro', 0);

-- ── Add org_id to tables that support ADD COLUMN with a DEFAULT ───────────
-- If any of these fail with "duplicate column name" the whole file is skipped
-- (migrate.ts behaviour), which is the correct no-op on re-run.

ALTER TABLE users             ADD COLUMN org_id TEXT NOT NULL DEFAULT '01JDEFAULTORG0000000000001';
ALTER TABLE inventory_lots    ADD COLUMN org_id TEXT NOT NULL DEFAULT '01JDEFAULTORG0000000000001';
ALTER TABLE transactions      ADD COLUMN org_id TEXT NOT NULL DEFAULT '01JDEFAULTORG0000000000001';
ALTER TABLE alert_thresholds  ADD COLUMN org_id TEXT NOT NULL DEFAULT '01JDEFAULTORG0000000000001';
ALTER TABLE push_subscriptions ADD COLUMN org_id TEXT NOT NULL DEFAULT '01JDEFAULTORG0000000000001';

-- ── Recreate locations with per-org unique name ───────────────────────────
DROP TABLE IF EXISTS _locations_old;
ALTER TABLE locations RENAME TO _locations_old;

CREATE TABLE locations (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  address    TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  org_id     TEXT    NOT NULL DEFAULT '01JDEFAULTORG0000000000001',
  UNIQUE (org_id, name)
);

INSERT INTO locations (id, name, address, active, created_at, org_id)
  SELECT id, name, address, active, created_at, '01JDEFAULTORG0000000000001'
  FROM _locations_old;

DROP TABLE _locations_old;

-- ── Recreate carton_types with per-org unique sku / barcode ───────────────
DROP TABLE IF EXISTS _carton_types_old;
ALTER TABLE carton_types RENAME TO _carton_types_old;

CREATE TABLE carton_types (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  sku        TEXT,
  barcode    TEXT,
  length_cm  REAL,
  width_cm   REAL,
  height_cm  REAL,
  unit_cost  REAL,
  notes      TEXT,
  created_at INTEGER NOT NULL,
  org_id     TEXT    NOT NULL DEFAULT '01JDEFAULTORG0000000000001',
  UNIQUE (org_id, sku),
  UNIQUE (org_id, barcode)
);

INSERT INTO carton_types (id, name, sku, barcode, length_cm, width_cm, height_cm, unit_cost, notes, created_at, org_id)
  SELECT id, name, sku, barcode, length_cm, width_cm, height_cm, unit_cost, notes, created_at, '01JDEFAULTORG0000000000001'
  FROM _carton_types_old;

DROP TABLE _carton_types_old;

-- ── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_org             ON users            (org_id);
CREATE INDEX IF NOT EXISTS idx_locations_org         ON locations        (org_id);
CREATE INDEX IF NOT EXISTS idx_carton_types_org      ON carton_types     (org_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_org    ON inventory_lots   (org_id);
CREATE INDEX IF NOT EXISTS idx_transactions_org      ON transactions     (org_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_location ON inventory_lots (location_id);
CREATE INDEX IF NOT EXISTS idx_transactions_location_date ON transactions (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type_date    ON transactions (type,        created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_carton_date  ON transactions (carton_type_id, created_at DESC);
