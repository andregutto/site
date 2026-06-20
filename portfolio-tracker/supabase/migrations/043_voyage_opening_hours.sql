-- 043: horário de funcionamento (Google Places regularOpeningHours.weekdayDescriptions)
-- Array de 7 strings já formatadas pelo Google (ex: "Monday: 9:00 AM – 6:00 PM").
ALTER TABLE voyage_places ADD COLUMN opening_hours TEXT[];
ALTER TABLE voyage_trip_places ADD COLUMN opening_hours TEXT[];
