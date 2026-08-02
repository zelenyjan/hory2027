-- @mentions inside accommodation comment threads.
CREATE TABLE comment_mentions (
  comment_id INTEGER NOT NULL REFERENCES accommodation_comments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX idx_comment_mentions_user ON comment_mentions(user_id);
