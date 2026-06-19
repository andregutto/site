-- 042: itens livres no roteiro (lugar | nota | transporte)
-- Roteiro unificado: além de lugares do mapa, aceita notas e trechos de transporte.
-- Itens não-lugar normalmente não têm lat/lng e portanto não aparecem no mapa.
ALTER TABLE voyage_trip_places
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'place'
  CHECK (kind IN ('place','note','transport'));
