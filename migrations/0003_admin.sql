-- Admin panel stats (2026-11-02). For databases created before this date. Run once:
--   npm run db:admin:local   /   npm run db:admin:remote
-- Don't run it on a database made from the current schema.sql (it already has these).
ALTER TABLE users ADD COLUMN last_seen INTEGER;
ALTER TABLE users ADD COLUMN active_ms INTEGER NOT NULL DEFAULT 0;

-- Stats for the admin panel: one row per finished online game, one per player in it.
CREATE TABLE IF NOT EXISTS plays (
  id          TEXT PRIMARY KEY,
  game        TEXT NOT NULL,
  room        TEXT,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER NOT NULL,
  players     INTEGER NOT NULL,
  outcome     TEXT
);
CREATE INDEX IF NOT EXISTS plays_game ON plays(game);
CREATE TABLE IF NOT EXISTS play_players (
  play_id  TEXT NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL,
  ms       INTEGER NOT NULL,
  moves    INTEGER NOT NULL DEFAULT 0,
  won      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (play_id, user_id)
);
CREATE INDEX IF NOT EXISTS play_players_user ON play_players(user_id);
