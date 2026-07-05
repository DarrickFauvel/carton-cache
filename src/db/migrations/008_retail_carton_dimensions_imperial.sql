-- Retail carton dimensions should be inches (imperial), matching weight_lb
-- and the fact these are US retail products — unlike on-site carton_types,
-- which stay in cm.
ALTER TABLE retail_carton_options ADD COLUMN length_in REAL;
ALTER TABLE retail_carton_options ADD COLUMN width_in  REAL;
ALTER TABLE retail_carton_options ADD COLUMN height_in REAL;

UPDATE retail_carton_options
  SET length_in = length_cm, width_in = width_cm, height_in = height_cm;

ALTER TABLE retail_carton_options DROP COLUMN length_cm;
ALTER TABLE retail_carton_options DROP COLUMN width_cm;
ALTER TABLE retail_carton_options DROP COLUMN height_cm;
