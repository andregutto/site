-- Migration 080: Tier 'pro' + entitlements (overrides, uso, interesse em upgrade)
--
-- Estratégia de tiers fechada em 2026-07-09 (docs/TIERS_PLAN.md):
-- free(0) < plus(1) < pro(2) < beta(3). 'beta' segue sendo interno/testers
-- (topo do ranking, nunca aparece como oferta); 'pro' entra entre plus e
-- beta como o degrau de análises profissionais (IR França, Diversification,
-- Insights, limites maiores de import/IA).

ALTER TABLE community_members DROP CONSTRAINT IF EXISTS community_members_tier_check;
ALTER TABLE community_members ADD CONSTRAINT community_members_tier_check
  CHECK (tier IN ('free', 'plus', 'pro', 'beta'));

ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_visibility_check;
ALTER TABLE resources ADD CONSTRAINT resources_visibility_check
  CHECK (visibility IN ('free', 'plus', 'pro', 'beta'));

-- Overrides editáveis da matriz de entitlements. Os defaults vivem em código
-- (shared-api/src/lib/entitlements.ts); o admin pode sobrescrever um gate ou
-- quota aqui sem deploy. Ausência de linha = vale o default do código.
CREATE TABLE IF NOT EXISTS entitlement_overrides (
  key text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('gate', 'quota')),
  -- gate:  {"requiredTier": "free"|"plus"|"pro"}  ('free' = gate desligado)
  -- quota: {"free": 0, "plus": 3, "pro": null, "beta": null}  (null = ilimitado)
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE entitlement_overrides ENABLE ROW LEVEL SECURITY;

-- Contadores de uso pra quotas por período (ex.: despesas de divisão por dia,
-- categorizações IA por mês). period: 'YYYY-MM-DD' (diário) ou 'YYYY-MM' (mensal).
CREATE TABLE IF NOT EXISTS entitlement_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_key text NOT NULL,
  period text NOT NULL,
  used integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, quota_key, period)
);
ALTER TABLE entitlement_usage ENABLE ROW LEVEL SECURITY;

-- Incremento atômico (upsert + soma) usado pelos endpoints que consomem quota.
CREATE OR REPLACE FUNCTION increment_entitlement_usage(p_user_id uuid, p_quota_key text, p_period text, p_amount integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE new_used integer;
BEGIN
  INSERT INTO entitlement_usage (user_id, quota_key, period, used)
  VALUES (p_user_id, p_quota_key, p_period, p_amount)
  ON CONFLICT (user_id, quota_key, period)
  DO UPDATE SET used = entitlement_usage.used + p_amount
  RETURNING used INTO new_used;
  RETURN new_used;
END;
$$;

-- Cada clique em "Avisar quando abrir" no modal de upgrade vira um registro
-- (1 por usuário+gate — voto de demanda por funcionalidade, não contador de
-- cliques). Alimenta a seção de métricas do admin e, futuramente, segmentos
-- no Kit.
CREATE TABLE IF NOT EXISTS upgrade_interest (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Identificador estável do gate/quota que disparou o modal (vem do módulo
  -- de entitlements, não é texto livre).
  gate text NOT NULL,
  -- Tier que destravaria o gate no momento do clique (a matriz pode evoluir).
  required_tier text NOT NULL CHECK (required_tier IN ('plus', 'pro')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, gate)
);
ALTER TABLE upgrade_interest ENABLE ROW LEVEL SECURITY;

-- Todas as tabelas acima: escrita/leitura só via service role (API);
-- nenhuma policy de acesso direto.
