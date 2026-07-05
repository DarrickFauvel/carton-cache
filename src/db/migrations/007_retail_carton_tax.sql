-- Track sales tax rate for retail carton options so the app can show a
-- tax-inclusive total, since store prices are pre-tax.
ALTER TABLE retail_carton_options ADD COLUMN tax_percent REAL;
