-- 040: Arvo Voyage — vertical de viagens
-- Três camadas: trips (experiência) | trip_members (colaboração) | trip_moments (custo/split)
--               places (biblioteca pessoal) | trip_places (lugares na viagem)

-- ── Viagens ──────────────────────────────────────────────────────────────────
CREATE TABLE voyage_trips (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  destination      TEXT,
  country          TEXT,
  cover_image_url  TEXT,
  cover_image_position TEXT NOT NULL DEFAULT '50% 50%',
  start_date       DATE,
  end_date         DATE,
  summary          TEXT,
  status           TEXT NOT NULL DEFAULT 'planning'
                     CHECK (status IN ('planning','ongoing','past')),
  share_token      UUID UNIQUE DEFAULT NULL,
  share_expires_at TIMESTAMPTZ DEFAULT NULL,
  share_hide_cost  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Colaboradores (espelha shared_group_members) ─────────────────────────────
CREATE TABLE voyage_trip_members (
  id                BIGSERIAL PRIMARY KEY,
  trip_id           BIGINT NOT NULL REFERENCES voyage_trips(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_email      TEXT,
  invite_token      TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  role              TEXT NOT NULL DEFAULT 'editor'
                      CHECK (role IN ('owner','editor','viewer')),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','active','left')),
  joined_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Custo por pessoa: cada colaborador annexa o próprio momento ───────────────
CREATE TABLE voyage_trip_moments (
  trip_id    BIGINT NOT NULL REFERENCES voyage_trips(id) ON DELETE CASCADE,
  moment_id  BIGINT NOT NULL REFERENCES finance_moments(id) ON DELETE CASCADE,
  user_id    UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (trip_id, moment_id)
);

-- ── Biblioteca pessoal de lugares (privada; fonte do import Takeout) ─────────
CREATE TABLE voyage_places (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category         TEXT,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  address          TEXT,
  city             TEXT,
  google_place_id  TEXT,
  google_maps_url  TEXT,
  notes            TEXT,
  source           TEXT NOT NULL DEFAULT 'manual',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Lugares NA viagem (denormalizados; compartilhados entre colaboradores) ────
CREATE TABLE voyage_trip_places (
  id               BIGSERIAL PRIMARY KEY,
  trip_id          BIGINT NOT NULL REFERENCES voyage_trips(id) ON DELETE CASCADE,
  added_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  library_place_id BIGINT REFERENCES voyage_places(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  category         TEXT,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  address          TEXT,
  google_place_id  TEXT,
  google_maps_url  TEXT,
  day_number       INT,
  sort_order       INT NOT NULL DEFAULT 0,
  is_highlight     BOOLEAN NOT NULL DEFAULT FALSE,
  rating           SMALLINT CHECK (rating BETWEEN 1 AND 5),
  visited          BOOLEAN NOT NULL DEFAULT FALSE,
  trip_note        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE voyage_trips        ENABLE ROW LEVEL SECURITY;
ALTER TABLE voyage_trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE voyage_trip_moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE voyage_places       ENABLE ROW LEVEL SECURITY;
ALTER TABLE voyage_trip_places  ENABLE ROW LEVEL SECURITY;

-- trips: owner ou membro (pending/active) pode ler; apenas owner/editor podem escrever
CREATE POLICY "trip_select" ON voyage_trips FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM voyage_trip_members m
    WHERE m.trip_id = voyage_trips.id AND m.user_id = auth.uid()
      AND m.status IN ('active','pending')
  )
);
CREATE POLICY "trip_insert" ON voyage_trips FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "trip_update" ON voyage_trips FOR UPDATE TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM voyage_trip_members m
    WHERE m.trip_id = voyage_trips.id AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.role IN ('owner','editor')
  )
);
CREATE POLICY "trip_delete" ON voyage_trips FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- members: owner da viagem ou o próprio membro
CREATE POLICY "tm_select" ON voyage_trip_members FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM voyage_trips t WHERE t.id = trip_id AND t.user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM voyage_trip_members m2
    WHERE m2.trip_id = voyage_trip_members.trip_id
      AND m2.user_id = auth.uid() AND m2.status = 'active'
  )
);
CREATE POLICY "tm_insert" ON voyage_trip_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tm_update" ON voyage_trip_members FOR UPDATE TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM voyage_trips t WHERE t.id = trip_id AND t.user_id = auth.uid())
);
CREATE POLICY "tm_delete" ON voyage_trip_members FOR DELETE TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM voyage_trips t WHERE t.id = trip_id AND t.user_id = auth.uid())
);

-- moments (custo): dono do momento ou membro ativo da viagem pode ver
CREATE POLICY "tmom_select" ON voyage_trip_moments FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM voyage_trip_members m
    WHERE m.trip_id = voyage_trip_moments.trip_id
      AND m.user_id = auth.uid() AND m.status = 'active'
  )
);
CREATE POLICY "tmom_write" ON voyage_trip_moments FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- places: privado por usuário
CREATE POLICY "places_own" ON voyage_places FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- trip_places: membros ativos podem ler/escrever
CREATE POLICY "tp_select" ON voyage_trip_places FOR SELECT TO authenticated USING (
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
CREATE POLICY "tp_write" ON voyage_trip_places FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM voyage_trips t WHERE t.id = trip_id AND (
      t.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM voyage_trip_members m
        WHERE m.trip_id = t.id AND m.user_id = auth.uid()
          AND m.status = 'active' AND m.role IN ('owner','editor')
      )
    )
  )
) WITH CHECK (true);

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_voyage_trips_user         ON voyage_trips(user_id);
CREATE INDEX idx_voyage_trips_share_token  ON voyage_trips(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_vtm_trip                  ON voyage_trip_members(trip_id);
CREATE INDEX idx_vtm_user                  ON voyage_trip_members(user_id);
CREATE INDEX idx_vtm_token                 ON voyage_trip_members(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX idx_vtmom_trip                ON voyage_trip_moments(trip_id);
CREATE INDEX idx_voyage_places_user        ON voyage_places(user_id);
CREATE INDEX idx_voyage_places_city        ON voyage_places(user_id, city);
CREATE INDEX idx_voyage_trip_places_trip   ON voyage_trip_places(trip_id);
CREATE INDEX idx_voyage_trip_places_day    ON voyage_trip_places(trip_id, day_number);
