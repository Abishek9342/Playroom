CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- guests get an internal 'guest_xxxxxxxx'
  display_name  TEXT,                                  -- shown in rooms
  pass_hash     TEXT NOT NULL,                         -- '' for guests (they can't log in)
  salt          TEXT NOT NULL,
  is_guest      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  email         TEXT,                                  -- from Google, when connected
  google_sub    TEXT,                                  -- Google account id, when connected
  last_seen     INTEGER,                               -- last time the app was open (ms)
  active_ms     INTEGER NOT NULL DEFAULT 0,            -- time with the app open and visible
  xp            INTEGER NOT NULL DEFAULT 0,
  streak        INTEGER NOT NULL DEFAULT 0,            -- days in a row with a game or the daily puzzle
  best_streak   INTEGER NOT NULL DEFAULT 0,
  streak_day    TEXT                                   -- last day that counted ('YYYY-MM-DD', India time)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_google ON users(google_sub);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  via         TEXT NOT NULL DEFAULT 'password',          -- password | google | guest
  created_at  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

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

-- Voice chat: bytes relayed through Cloudflare TURN per calendar month (UTC), for the 950 GB cap.
CREATE TABLE IF NOT EXISTS voice_usage (
  month  TEXT PRIMARY KEY,           -- 'YYYY-MM'
  bytes  INTEGER NOT NULL DEFAULT 0
);

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
