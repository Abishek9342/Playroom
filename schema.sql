CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- guests get an internal 'guest_xxxxxxxx'
  display_name  TEXT,                                  -- shown in rooms
  pass_hash     TEXT NOT NULL,                         -- '' for guests (they can't log in)
  salt          TEXT NOT NULL,
  is_guest      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  email         TEXT,                                  -- from Google, when connected
  google_sub    TEXT                                   -- Google account id, when connected
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
