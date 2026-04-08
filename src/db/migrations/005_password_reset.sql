CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  token_hash TEXT    NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user       ON password_reset_tokens (user_id);
