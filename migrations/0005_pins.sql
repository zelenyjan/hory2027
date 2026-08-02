-- Pinned important links and uploaded files shared with the group.
CREATE TABLE pins (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('link', 'file')),
  title TEXT NOT NULL,
  url TEXT,
  file_key TEXT,
  file_name TEXT,
  content_type TEXT,
  byte_size INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (kind = 'link' AND url IS NOT NULL AND file_key IS NULL)
    OR (kind = 'file' AND file_key IS NOT NULL AND url IS NULL)
  )
);
CREATE INDEX idx_pins_created ON pins(created_at DESC);
