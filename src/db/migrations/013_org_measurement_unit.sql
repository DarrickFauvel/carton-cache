-- Org-level unit for entering and displaying carton dimensions. Storage
-- stays in cm (carton_types.*_cm); this only controls the UI.
ALTER TABLE organizations ADD COLUMN measurement_unit TEXT NOT NULL DEFAULT 'in';
