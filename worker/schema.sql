-- Anonymous timings for Call Journal's success measure. No IPs, user agents, ids or cookies.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  day TEXT NOT NULL,        -- YYYY-MM-DD (UTC), no time of day
  event TEXT NOT NULL,      -- lessons_done | first_trade
  minutes REAL NOT NULL,    -- minutes since the first lesson was opened
  lessons INTEGER NOT NULL, -- lessons finished at that point (0-7)
  site TEXT NOT NULL        -- live | dev
);
CREATE INDEX IF NOT EXISTS events_site ON events (site, event);
