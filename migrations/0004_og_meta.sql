-- Best-effort Open Graph metadata scraped when a place is added.
ALTER TABLE accommodations ADD COLUMN og_title TEXT;
ALTER TABLE accommodations ADD COLUMN og_description TEXT;
ALTER TABLE accommodations ADD COLUMN og_image_key TEXT;
