-- XP, levels, streaks and the daily puzzle (2026-11-02). For databases created before this date.
--   npm run db:xp:local   /   npm run db:xp:remote
-- Don't run it on a database made from the current schema.sql (the ALTERs would fail).
ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN best_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN streak_day TEXT;

-- XP, levels and streaks (2026-11-02)
-- users: xp, streak, best_streak, streak_day ('YYYY-MM-DD', India time)
-- Daily puzzle: one row per player per day (time = solved_at - started_at).
CREATE TABLE IF NOT EXISTS daily_runs (
  user_id     TEXT NOT NULL,
  day         TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  solved_at   INTEGER,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS daily_runs_day ON daily_runs(day);
