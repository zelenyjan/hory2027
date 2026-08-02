-- Free-text trip roster (names need not match users). Order is drag-and-drop.
CREATE TABLE attendees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_attendees_position ON attendees(position, id);
