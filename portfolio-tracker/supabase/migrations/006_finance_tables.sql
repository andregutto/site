-- ============================================================
-- Seção Finanças — tabelas de controle de despesas
-- ============================================================

-- Renda mensal líquida do usuário (base para % dos envelopes)
CREATE TABLE IF NOT EXISTS finance_income (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_net NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency    VARCHAR(3)  NOT NULL DEFAULT 'BRL',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- Envelopes de budget (ex: Essenciais 50%, Futuro 30%, Reserva 10%, Livre 10%)
CREATE TABLE IF NOT EXISTS finance_envelopes (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        VARCHAR(80) NOT NULL,
  pct_target  NUMERIC(5,2) NOT NULL DEFAULT 0,  -- percentual da renda (ex: 50.00)
  color       VARCHAR(20) NOT NULL DEFAULT '#6366f1',
  type        VARCHAR(20) NOT NULL DEFAULT 'essential',  -- essential|investment|savings|free
  icon        VARCHAR(10) NOT NULL DEFAULT '📦',
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categorias granulares de despesa (cada uma pertence a um envelope)
CREATE TABLE IF NOT EXISTS finance_categories (
  id             SERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  envelope_id    INT REFERENCES finance_envelopes(id) ON DELETE SET NULL,
  name           VARCHAR(80) NOT NULL,
  color          VARCHAR(20) NOT NULL DEFAULT '#94a3b8',
  icon           VARCHAR(10) NOT NULL DEFAULT '🏷️',
  budget_monthly NUMERIC(12,2),  -- orçamento mensal opcional por categoria
  keyword_rules  JSONB NOT NULL DEFAULT '[]',  -- ex: ["netflix","spotify"]
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conexões bancárias via GoCardless
CREATE TABLE IF NOT EXISTS finance_bank_connections (
  id               SERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_id   VARCHAR(100) NOT NULL,
  institution_name VARCHAR(150) NOT NULL,
  requisition_id   VARCHAR(100) NOT NULL,
  status           VARCHAR(30) NOT NULL DEFAULT 'pending',  -- pending|linked|expired|error
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contas bancárias conectadas
CREATE TABLE IF NOT EXISTS finance_bank_accounts (
  id               SERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id    INT REFERENCES finance_bank_connections(id) ON DELETE CASCADE,
  account_id       VARCHAR(100) NOT NULL,  -- ID da conta no GoCardless
  name             VARCHAR(150) NOT NULL,
  currency         VARCHAR(3) NOT NULL DEFAULT 'EUR',
  balance          NUMERIC(14,2),
  last_synced      TIMESTAMPTZ,
  linked_asset_id  INT REFERENCES assets(id) ON DELETE SET NULL,  -- ativo no portfolio
  UNIQUE (user_id, account_id)
);

-- Transações financeiras (importadas ou manuais)
CREATE TABLE IF NOT EXISTS finance_transactions (
  id                   SERIAL PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id           INT REFERENCES finance_bank_accounts(id) ON DELETE SET NULL,
  category_id          INT REFERENCES finance_categories(id) ON DELETE SET NULL,
  external_id          VARCHAR(200),  -- ID único da transação no GoCardless/banco
  date                 DATE NOT NULL,
  amount               NUMERIC(14,2) NOT NULL,  -- negativo = despesa, positivo = receita
  currency             VARCHAR(3) NOT NULL DEFAULT 'EUR',
  description          VARCHAR(500) NOT NULL DEFAULT '',
  is_internal_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  source               VARCHAR(20) NOT NULL DEFAULT 'manual',  -- gocardless|csv|manual
  raw_data             JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, external_id)
);

-- Planos de liberdade financeira (múltiplos por usuário, histórico de revisões)
CREATE TABLE IF NOT EXISTS finance_freedom_plans (
  id                    SERIAL PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  VARCHAR(150) NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT FALSE,
  initial_capital       NUMERIC(16,2) NOT NULL DEFAULT 0,
  monthly_contribution  NUMERIC(14,2) NOT NULL DEFAULT 0,
  monthly_return_rate   NUMERIC(8,6) NOT NULL DEFAULT 0.006,  -- ex: 0.006 = 0.6%/mês
  monthly_income_rate   NUMERIC(8,6) NOT NULL DEFAULT 0.005,  -- taxa de renda passiva
  target_amount         NUMERIC(16,2) NOT NULL DEFAULT 0,
  currency              VARCHAR(3) NOT NULL DEFAULT 'EUR',
  horizon_years         INT NOT NULL DEFAULT 20,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE finance_income            ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_envelopes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_bank_connections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_bank_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_freedom_plans     ENABLE ROW LEVEL SECURITY;

-- Políticas: usuário só vê/edita seus próprios dados
DO $$ DECLARE t TEXT;
BEGIN FOR t IN SELECT unnest(ARRAY[
  'finance_income','finance_envelopes','finance_categories',
  'finance_bank_connections','finance_bank_accounts',
  'finance_transactions','finance_freedom_plans'
]) LOOP
  EXECUTE format('CREATE POLICY "%s_user_policy" ON %s FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t, t);
END LOOP; END $$;

-- ── Índices ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_finance_transactions_user_date  ON finance_transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_category   ON finance_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_finance_categories_envelope     ON finance_categories(envelope_id);
CREATE INDEX IF NOT EXISTS idx_finance_freedom_plans_user      ON finance_freedom_plans(user_id, created_at DESC);
