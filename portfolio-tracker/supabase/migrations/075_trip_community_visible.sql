-- Galeria de viagens na Comunidade (frente C): o dono pode disponibilizar a
-- viagem pra galeria, um consentimento SEPARADO do link público por token
-- (share_token) — os dois podem existir juntos ou isolados.
ALTER TABLE voyage_trips
  ADD COLUMN community_visible BOOLEAN NOT NULL DEFAULT false;

-- Índice parcial: a galeria só consulta as visíveis (minoria das viagens).
CREATE INDEX idx_voyage_trips_community_visible
  ON voyage_trips (created_at DESC)
  WHERE community_visible;
