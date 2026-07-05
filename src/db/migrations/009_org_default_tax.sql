-- Org-level default sales tax rate, used to prefill new retail carton
-- option entries (each entry can still override it individually).
ALTER TABLE organizations ADD COLUMN default_tax_percent REAL;
