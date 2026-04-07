CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  expires INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires);
