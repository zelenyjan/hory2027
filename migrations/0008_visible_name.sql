-- Optional public display name; login identity stays on users.name.
ALTER TABLE users ADD COLUMN visible_name TEXT;
