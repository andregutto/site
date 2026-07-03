-- ============================================================
-- Arvo Comunidade — V1 (4ª vertical: fórum fechado)
-- ============================================================
-- Modelo genérico (categories/topics/posts), espelha o vocabulário
-- do Discourse para facilitar export futuro. Acesso fechado
-- (só usuários logados); tier preparado para monetização futura.
-- ============================================================

-- Categorias do fórum (seed fixo na V1, editável só por admin no futuro)
CREATE TABLE community_categories (
  id          BIGSERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name_key    TEXT NOT NULL,
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tópico = thread. O primeiro post vem junto na criação.
CREATE TABLE community_topics (
  id              BIGSERIAL PRIMARY KEY,
  category_id     BIGINT NOT NULL REFERENCES community_categories(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  linked_trip_id  BIGINT REFERENCES voyage_trips(id) ON DELETE SET NULL,
  pinned          BOOLEAN NOT NULL DEFAULT FALSE,
  locked          BOOLEAN NOT NULL DEFAULT FALSE,
  reply_count     INTEGER NOT NULL DEFAULT 0,
  last_post_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_community_topics_category ON community_topics(category_id, pinned DESC, last_post_at DESC);

-- Post = mensagem dentro de um tópico (inclui o primeiro post do autor).
CREATE TABLE community_posts (
  id          BIGSERIAL PRIMARY KEY,
  topic_id    BIGINT NOT NULL REFERENCES community_topics(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  edited_at   TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_community_posts_topic ON community_posts(topic_id, created_at);

-- Curtidas em posts.
CREATE TABLE community_post_likes (
  post_id     BIGINT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- Membership/tier — preparado pra monetização futura; V1 cria 'free' on-first-visit.
CREATE TABLE community_members (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier        TEXT NOT NULL DEFAULT 'free',
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed de categorias iniciais
INSERT INTO community_categories (slug, name_key, icon, sort_order) VALUES
  ('geral',     'community.cat.geral',     '💬', 0),
  ('suporte',   'community.cat.suporte',   '🛟', 1),
  ('sugestoes', 'community.cat.sugestoes', '💡', 2),
  ('viagens',   'community.cat.viagens',   '🧭', 3);

-- RLS: habilitado para todas as tabelas novas; autorização real fica no
-- código do router (supabaseAdmin/service_role bypassa RLS), mesmo padrão
-- do restante do app.
ALTER TABLE community_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_topics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_likes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members     ENABLE ROW LEVEL SECURITY;
