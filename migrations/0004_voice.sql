-- Voice chat relay usage (2026-11-02). Safe to run on any database (IF NOT EXISTS).
--   npm run db:voice:local   /   npm run db:voice:remote

-- Voice chat: bytes relayed through Cloudflare TURN per calendar month (UTC), for the 950 GB cap.
CREATE TABLE IF NOT EXISTS voice_usage (
  month  TEXT PRIMARY KEY,           -- 'YYYY-MM'
  bytes  INTEGER NOT NULL DEFAULT 0
);
