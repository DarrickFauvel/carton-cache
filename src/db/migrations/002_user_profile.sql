-- Add avatar_color to existing users table (safe to re-run: migrate.ts catches duplicate column errors)
ALTER TABLE users ADD COLUMN avatar_color TEXT NOT NULL DEFAULT 'color-1';
