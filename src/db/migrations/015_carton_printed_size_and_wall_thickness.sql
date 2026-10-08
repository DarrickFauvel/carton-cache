-- A carton has three sizes:
--   * length_cm/width_cm/height_cm: the *actual inside* dimensions, measured.
--     Fit suggestions use these.
--   * printed_*_cm: the nominal size printed on the box (e.g. 6 x 6 x 6 for a
--     box that is really 5.75 x 5.75 x 6.25 inside). Optional; used to name
--     the carton and in its label code.
--   * outer = inside + 2 x wall_thickness_cm, used for eBay package sizes.
--     Default is typical single-wall corrugated board, 1/8 in (keep in sync
--     with DEFAULT_WALL_THICKNESS_CM in src/lib/units.js).
ALTER TABLE carton_types ADD COLUMN printed_length_cm REAL;
ALTER TABLE carton_types ADD COLUMN printed_width_cm REAL;
ALTER TABLE carton_types ADD COLUMN printed_height_cm REAL;
ALTER TABLE carton_types ADD COLUMN wall_thickness_cm REAL NOT NULL DEFAULT 0.3175;
