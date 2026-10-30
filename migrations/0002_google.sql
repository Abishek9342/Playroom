-- For databases created before Google sign-in (2026-10-30). Run once:
--   npm run db:migrate:local   (and db:migrate:remote if the live database predates it)
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_google ON users(google_sub);
ALTER TABLE sessions ADD COLUMN via TEXT NOT NULL DEFAULT 'password';
ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
