-- 076: Frente G — cards de informações úteis + compartilhamento parcial
-- 1) voyage_trip_info_cards: cards de informação prática da viagem (agência,
--    transporte, passeio, hospedagem, restaurante ou tipo livre). Membros da
--    viagem veem todos; só o dono cria/edita; as visões compartilhadas
--    (público/gate/comunidade) recebem apenas os com shared=true.
-- 2) Compartilhamento parcial: um flag por item vale pra TODAS as superfícies
--    externas (link público, gate e comunidade) — nunca por superfície.
--    - voyage_trip_places.shared: ocultar um lugar inteiro do roteiro.
--    - voyage_trips.share_hidden_category_ids / share_hidden_transaction_ids:
--      listas trip-scoped de categorias/transações de custo ocultas (espelha a
--      semântica do exclude_from_stats de Finanças, mas sem tocar nas tabelas
--      de finanças — a mesma transação pode estar visível em outra viagem).

-- ── Cards de informações úteis ────────────────────────────────────────────────
CREATE TABLE voyage_trip_info_cards (
  id         BIGSERIAL PRIMARY KEY,
  trip_id    BIGINT NOT NULL REFERENCES voyage_trips(id) ON DELETE CASCADE,
  -- 'agency' | 'transport' | 'tour' | 'lodging' | 'restaurant' | texto livre curto
  kind       VARCHAR(40) NOT NULL DEFAULT 'other',
  title      TEXT NOT NULL,
  body       TEXT,
  phone      VARCHAR(40),
  url        VARCHAR(500),
  shared     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE voyage_trip_info_cards ENABLE ROW LEVEL SECURITY;

-- Leitura: dono ou membro ativo da viagem (mesma regra do tp_select)
CREATE POLICY "vtic_select" ON voyage_trip_info_cards FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM voyage_trips t WHERE t.id = trip_id AND (
      t.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM voyage_trip_members m
        WHERE m.trip_id = t.id AND m.user_id = auth.uid() AND m.status = 'active'
      )
    )
  )
);

-- Escrita: só o dono da viagem
CREATE POLICY "vtic_write" ON voyage_trip_info_cards FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM voyage_trips t WHERE t.id = trip_id AND t.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM voyage_trips t WHERE t.id = trip_id AND t.user_id = auth.uid())
);

CREATE INDEX idx_vtic_trip ON voyage_trip_info_cards(trip_id);

-- ── Compartilhamento parcial ──────────────────────────────────────────────────
ALTER TABLE voyage_trip_places ADD COLUMN shared BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE voyage_trips ADD COLUMN share_hidden_category_ids    BIGINT[] NOT NULL DEFAULT '{}';
ALTER TABLE voyage_trips ADD COLUMN share_hidden_transaction_ids BIGINT[] NOT NULL DEFAULT '{}';
