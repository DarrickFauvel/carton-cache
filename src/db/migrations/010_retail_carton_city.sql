-- Distinguish branches of the same chain (e.g. "Staples" in different
-- cities) when they carry different retail carton options.
ALTER TABLE retail_carton_options ADD COLUMN city TEXT;
