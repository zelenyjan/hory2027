-- Per-user push notification categories (1 = on). Mentions can fire even when messages are off.
ALTER TABLE users ADD COLUMN notify_messages INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_mentions INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_votes INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_places INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_links INTEGER NOT NULL DEFAULT 1;

-- Who was @tagged in a chat message (body still holds the visible @Name text).
CREATE TABLE message_mentions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX idx_message_mentions_user ON message_mentions(user_id);
