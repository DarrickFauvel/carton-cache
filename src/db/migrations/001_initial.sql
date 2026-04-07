-- Carton Cache — initial schema

CREATE TABLE IF NOT EXISTS users (
  id           TEXT    PRIMARY KEY,
  email        TEXT    UNIQUE NOT NULL,
  name         TEXT    NOT NULL,
  password_hash TEXT   NOT NULL,
  role         TEXT    NOT NULL CHECK (role IN ('admin','manager','staff','viewer')),
  location_ids TEXT    NOT NULL DEFAULT '[]',
  avatar_color TEXT    NOT NULL DEFAULT 'color-1',
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  address    TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS carton_types (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  sku        TEXT    UNIQUE,
  barcode    TEXT    UNIQUE,
  length_cm  REAL,
  width_cm   REAL,
  height_cm  REAL,
  unit_cost  REAL,
  notes      TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_lots (
  id              TEXT    PRIMARY KEY,
  location_id     TEXT    NOT NULL REFERENCES locations(id),
  carton_type_id  TEXT    NOT NULL REFERENCES carton_types(id),
  condition       TEXT    NOT NULL CHECK (condition IN ('new','good','fair','poor')),
  quantity        INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at      INTEGER NOT NULL,
  UNIQUE (location_id, carton_type_id, condition)
);

-- Append-only ledger. No DELETE or UPDATE allowed.
CREATE TABLE IF NOT EXISTS transactions (
  id                    TEXT    PRIMARY KEY,
  type                  TEXT    NOT NULL CHECK (type IN ('receive','consume','transfer_out','transfer_in','adjustment')),
  carton_type_id        TEXT    NOT NULL REFERENCES carton_types(id),
  condition             TEXT    NOT NULL CHECK (condition IN ('new','good','fair','poor')),
  quantity              INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost_snapshot    REAL,
  location_id           TEXT    NOT NULL REFERENCES locations(id),
  linked_transaction_id TEXT    REFERENCES transactions(id),
  user_id               TEXT    NOT NULL REFERENCES users(id),
  notes                 TEXT,
  created_at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_thresholds (
  id              TEXT    PRIMARY KEY,
  location_id     TEXT    NOT NULL REFERENCES locations(id),
  carton_type_id  TEXT    NOT NULL REFERENCES carton_types(id),
  condition       TEXT    NOT NULL DEFAULT 'any',
  min_quantity    INTEGER NOT NULL DEFAULT 5,
  UNIQUE (location_id, carton_type_id, condition)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES users(id),
  endpoint   TEXT    NOT NULL UNIQUE,
  p256dh     TEXT    NOT NULL,
  auth       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_inventory_lots_location
  ON inventory_lots (location_id);

CREATE INDEX IF NOT EXISTS idx_transactions_location_date
  ON transactions (location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_type_date
  ON transactions (type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_carton_date
  ON transactions (carton_type_id, created_at DESC);
