-- Migration 074: Lead magnet de viagens (frente B do YouTube)
--
-- Espelho do mecanismo de Recursos (068/073) para viagens: a rota gated
-- /voyage/shared/:tripId mostra um convite de cadastro pro visitante
-- deslogado (só quando o dono habilitou compartilhamento, share_token não
-- nulo). A atribuição do cadastro fica em profiles.signup_source =
-- 'trip:<id>' — mesmos triggers das migrations 068/072, nada novo aqui —
-- e o funil de visitas do gate fica em trip_share_events.

-- ── 1. Links de divulgação (rótulo → utm_campaign) ──────────────────────────
-- Espelho de resource_links (073): lista de referência do admin pra colar na
-- descrição dos vídeos. Não afeta a gravação de eventos, que lê os utm_*
-- direto da URL clicada, independente de terem sido gerados aqui.
CREATE TABLE trip_share_links (
  id           SERIAL PRIMARY KEY,
  trip_id      BIGINT NOT NULL REFERENCES voyage_trips(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  utm_campaign TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX trip_share_links_trip_idx ON trip_share_links(trip_id);

ALTER TABLE trip_share_links ENABLE ROW LEVEL SECURITY;
-- Sem policy de client: só via API com service_role, igual resource_links.

-- ── 2. Eventos do gate (por enquanto só 'view') ──────────────────────────────
-- Espelho de resource_events (068). Cadastros não viram evento: são contados
-- direto em profiles.signup_source = 'trip:<id>'.
CREATE TABLE trip_share_events (
  id           BIGSERIAL PRIMARY KEY,
  trip_id      BIGINT NOT NULL REFERENCES voyage_trips(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL = visitante anônimo
  event_type   VARCHAR(10) NOT NULL CHECK (event_type IN ('view')),
  utm_source   VARCHAR(120),
  utm_medium   VARCHAR(120),
  utm_campaign VARCHAR(120),
  utm_content  VARCHAR(120),
  referrer     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX trip_share_events_trip_idx ON trip_share_events(trip_id, event_type);
CREATE INDEX trip_share_events_user_idx ON trip_share_events(user_id);

ALTER TABLE trip_share_events ENABLE ROW LEVEL SECURITY;
-- Idem: só via API.
