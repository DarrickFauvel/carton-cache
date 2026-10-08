-- A location can sit inside another one (one level), e.g. a stack of cartons
-- on a shelf in the office. Stock lives on the sublocation itself.
ALTER TABLE locations ADD COLUMN parent_id TEXT REFERENCES locations(id);
