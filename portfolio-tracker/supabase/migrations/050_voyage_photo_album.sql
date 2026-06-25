-- Optional external shared photo album link (e.g. Google Photos), shown on
-- the public trip page so visitors can see more photos of the places.
ALTER TABLE voyage_trips ADD COLUMN IF NOT EXISTS photo_album_url TEXT;
