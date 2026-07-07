-- Links de divulgação gerados pelo admin de Recursos: cada linha é um link
-- com UTM já embutido (utm_campaign = identificador do vídeo), pra copiar e
-- colar direto na descrição de um vídeo, com um rótulo de referência ("onde
-- vou usar esse link") pra não esquecer depois. Puramente uma lista de
-- referência do André — não afeta a gravação de resource_events, que já lê
-- os utm_* direto da URL clicada, independente de terem sido gerados aqui.

CREATE TABLE IF NOT EXISTS resource_links (
  id SERIAL PRIMARY KEY,
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  utm_campaign TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resource_links_resource_id_idx ON resource_links(resource_id);

ALTER TABLE resource_links ENABLE ROW LEVEL SECURITY;
-- Sem policy de client: só via API com supabaseAdmin (service_role), mesmo
-- padrão de resources/resource_events.
