-- Multi-destination trips (Eurotrip): a single trip can span several
-- cities/regions, each with its own relative day range (day_start/day_end,
-- relative to the trip — not absolute dates, mirrors how itinerary items
-- already use day_number relative to the trip).
CREATE TABLE voyage_trip_destinations (
  id          BIGSERIAL PRIMARY KEY,
  trip_id     BIGINT NOT NULL REFERENCES voyage_trips(id) ON DELETE CASCADE,
  city        TEXT,
  country     TEXT,
  day_start   INTEGER,
  day_end     INTEGER,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_voyage_trip_destinations_trip ON voyage_trip_destinations(trip_id);

-- Backfill: trips with a legacy single destination/country get one
-- destination row spanning the whole trip, so existing trips keep working
-- without needing the user to re-enter anything.
INSERT INTO voyage_trip_destinations (trip_id, city, country, day_start, day_end, sort_order)
SELECT
  t.id, t.destination, t.country, 1,
  COALESCE(
    (SELECT MAX(p.day_number) FROM voyage_trip_places p WHERE p.trip_id = t.id),
    CASE WHEN t.start_date IS NOT NULL AND t.end_date IS NOT NULL
      THEN (t.end_date - t.start_date) + 1 ELSE NULL END
  ),
  0
FROM voyage_trips t
WHERE t.destination IS NOT NULL OR t.country IS NOT NULL;

-- Per-item destination override — defaults to inferring from day_number vs
-- the trip's destinations' day ranges; explicit when items on a transition
-- day (e.g. morning in Paris, evening in Amsterdam) need to differ from
-- each other despite sharing a day_number.
ALTER TABLE voyage_trip_places ADD COLUMN IF NOT EXISTS destination_id BIGINT
  REFERENCES voyage_trip_destinations(id) ON DELETE SET NULL;
