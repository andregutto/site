-- 041: Despesas por lugar + flags de visibilidade/centralização do mapa
-- voyage_place_expenses: junção transação ↔ lugar da viagem (vínculo privado do dono).
-- show_place_expenses: expõe o AGREGADO por lugar a colaboradores/público (opt-in).
-- dest_lat/dest_lng: coordenadas do destino (autocomplete) para centralizar o mapa.

CREATE TABLE voyage_place_expenses (
  id             BIGSERIAL PRIMARY KEY,
  trip_place_id  BIGINT NOT NULL REFERENCES voyage_trip_places(id) ON DELETE CASCADE,
  transaction_id INT    NOT NULL REFERENCES finance_transactions(id) ON DELETE CASCADE,
  user_id        UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_place_id, transaction_id)
);

ALTER TABLE voyage_place_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vpe_own" ON voyage_place_expenses FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_vpe_trip_place  ON voyage_place_expenses(trip_place_id);
CREATE INDEX idx_vpe_transaction ON voyage_place_expenses(transaction_id);
CREATE INDEX idx_vpe_user        ON voyage_place_expenses(user_id);

-- Flag de visibilidade do agregado por lugar para colaboradores/público
ALTER TABLE voyage_trips ADD COLUMN show_place_expenses BOOLEAN NOT NULL DEFAULT FALSE;

-- Coordenadas do destino para centralizar o mapa (Workstream C)
ALTER TABLE voyage_trips ADD COLUMN dest_lat DOUBLE PRECISION;
ALTER TABLE voyage_trips ADD COLUMN dest_lng DOUBLE PRECISION;
