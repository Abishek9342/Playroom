-- Daily visitors for the admin panel (2026-11-17). Safe to run on any database (CREATE IF NOT EXISTS).
--   npm run db:visits:local   /   npm run db:visits:remote
-- One row per device per day (India time). vid = a random id the app keeps on the device: no IP,
-- no name. signed_in = 1 if that device was signed in at any point that day.
CREATE TABLE IF NOT EXISTS visits (
  day        TEXT NOT NULL,
  vid        TEXT NOT NULL,
  first_at   INTEGER NOT NULL,
  signed_in  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, vid)
);
