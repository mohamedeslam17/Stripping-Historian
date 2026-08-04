-- Stripping Historian — server-side event log (Cloudflare D1)
--
-- The event log stays append-mostly and the client remains the source of the
-- event *shape*: the server stores each event as an opaque JSON blob keyed by a
-- client-generated uid. That keeps the domain model in index.html, where every
-- test already covers it, and means a schema change to an event never needs a
-- migration here.

CREATE TABLE IF NOT EXISTS events (
  uid        TEXT PRIMARY KEY,
  datetime   TEXT NOT NULL,          -- local "YYYY-MM-DDTHH:MM", used for ordering
  body       TEXT NOT NULL,          -- the whole event object as JSON
  deleted    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL        -- ms epoch, server clock; drives last-write-wins
);

CREATE INDEX IF NOT EXISTS events_by_datetime ON events(datetime);
CREATE INDEX IF NOT EXISTS events_by_updated  ON events(updated_at);

CREATE TABLE IF NOT EXISTS config (
  k          TEXT PRIMARY KEY,
  v          TEXT NOT NULL,          -- JSON-encoded value
  updated_at INTEGER NOT NULL
);
