-- Admins da comunidade em banco (antes: UUID fixo em env var).
-- Promover/rebaixar membros passa a ser possível pelo painel.
CREATE TABLE community_admins (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  promoted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE community_admins ENABLE ROW LEVEL SECURITY;
-- service_role bypassa RLS; nenhuma policy por usuário (leitura só via API).

-- Seed: fundador
INSERT INTO community_admins (user_id) VALUES ('453bc770-0cea-4c88-b72f-babf9e50437e')
ON CONFLICT (user_id) DO NOTHING;

-- Categorias criadas pelo painel: nome literal (name_key continua para as
-- categorias seed traduzidas via i18n) e ícone do set outline por chave.
ALTER TABLE community_categories
  ADD COLUMN IF NOT EXISTS name        TEXT,
  ADD COLUMN IF NOT EXISTS icon_key    TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
