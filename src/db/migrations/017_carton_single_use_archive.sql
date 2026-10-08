-- One-time-use cartons (e.g. an unbranded box that came with an item) are
-- archived once their stock runs out, hiding them from consume/transfer/
-- adjust pickers while keeping their transaction history. Receiving one
-- again un-archives it.
ALTER TABLE carton_types ADD COLUMN single_use INTEGER NOT NULL DEFAULT 0;
ALTER TABLE carton_types ADD COLUMN archived_at INTEGER;
