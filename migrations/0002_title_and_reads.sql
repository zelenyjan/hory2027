-- Optional headline for a place; existing rows keep falling back to their location.
ALTER TABLE accommodations ADD COLUMN title TEXT;

-- One high-water mark per reader: everything up to this id has been seen.
CREATE TABLE message_reads (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
