-- Migration 068: Recursos (lead magnets do canal YouTube)
--
-- Páginas públicas /recursos/:slug que mostram título/descrição/preview mas
-- exigem cadastro/login para liberar o download ou conteúdo. Cada vídeo do
-- canal aponta pra um recurso; a atribuição (qual recurso trouxe cada usuário)
-- fica em profiles.signup_source + resource_events, pra medir qual vídeo
-- converte. Sync com o Kit (ex-ConvertKit) fica pra uma etapa seguinte, mas o
-- schema já está preparado (resources.kit_tag, resource_events.kit_synced_at).

-- ── 1. Catálogo de recursos ───────────────────────────────────────────────
CREATE TABLE resources (
  id                SERIAL PRIMARY KEY,
  slug              VARCHAR(80)  NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,80}$'),
  title             VARCHAR(160) NOT NULL,
  description       TEXT,
  resource_type     VARCHAR(10)  NOT NULL CHECK (resource_type IN ('file','link','content')),
  file_path         TEXT,         -- resource_type='file': caminho no bucket 'resources'
  external_url      TEXT,         -- resource_type='link': URL externa (Notion, Sheets...)
  content_md        TEXT,         -- resource_type='content': conteúdo liberado após o gate
  preview_image_url TEXT,
  visibility        VARCHAR(10)  NOT NULL DEFAULT 'free' CHECK (visibility IN ('free','paid')),
  kit_tag           VARCHAR(80),  -- tag do Kit a aplicar no subscriber (sync futuro)
  is_published      BOOLEAN      NOT NULL DEFAULT FALSE,
  sort_order        SMALLINT     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
-- Sem policy por usuário: leitura/escrita só via API (service_role bypassa RLS).

-- ── 2. Eventos (funil por recurso: view → signup → unlock/download) ───────
CREATE TABLE resource_events (
  id           BIGSERIAL PRIMARY KEY,
  resource_id  INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL = visitante anônimo
  event_type   VARCHAR(10) NOT NULL CHECK (event_type IN ('view','signup','unlock','download')),
  utm_source   VARCHAR(120),
  utm_medium   VARCHAR(120),
  utm_campaign VARCHAR(120),
  utm_content  VARCHAR(120),
  referrer     TEXT,
  kit_synced_at TIMESTAMPTZ,  -- preenchido quando o evento for sincronizado com o Kit
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resource_events_resource ON resource_events(resource_id, event_type);
CREATE INDEX idx_resource_events_user     ON resource_events(user_id);

ALTER TABLE resource_events ENABLE ROW LEVEL SECURITY;
-- Idem: só via API.

-- ── 3. Atribuição no perfil ────────────────────────────────────────────────
-- O cadastro vindo de uma página de recurso grava signup_source no
-- user_metadata (ex: 'resource:planilha-custo-de-vida-paris'); o trigger copia
-- pro perfil no INSERT. Nome com prefixo 'zz' pra rodar DEPOIS de
-- on_auth_user_created (Postgres dispara triggers em ordem alfabética), que é
-- quem cria a linha em profiles.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signup_source TEXT;

CREATE OR REPLACE FUNCTION public.set_signup_source()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'signup_source' IS NOT NULL THEN
    UPDATE public.profiles
       SET signup_source = NEW.raw_user_meta_data->>'signup_source'
     WHERE id = NEW.id AND signup_source IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER zz_on_auth_user_signup_source
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.set_signup_source();

-- ── 4. Bucket privado pros arquivos ────────────────────────────────────────
-- Diferente de 'avatars', é privado: download só via signed URL gerada pela
-- API depois do gate de login. Upload só pela API (service_role).
INSERT INTO storage.buckets (id, name, public) VALUES ('resources', 'resources', false)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Seed: primeiro recurso (rascunho, publicar quando o arquivo subir) ──
INSERT INTO resources (slug, title, description, resource_type, visibility, is_published)
VALUES (
  'planilha-custo-de-vida-paris',
  'Planilha de custo de vida em Paris',
  'A planilha que eu uso pra planejar o custo de vida em Paris: moradia, mercado, transporte, lazer e impostos, com valores reais e conversão EUR/BRL.',
  'file',
  'free',
  FALSE
)
ON CONFLICT (slug) DO NOTHING;
