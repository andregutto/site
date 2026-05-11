-- ============================================================
-- Portfolio Tracker — Schema v2 (genérico, multi-usuário)
-- ============================================================
-- Tipos de ativo:
--   ticker       → preço via API (brapi / Yahoo / CoinGecko)
--   fixed_income → valor calculado via fator CDI/IPCA/pré (BCB)
--   manual       → usuário digita valor mensal
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- Profiles
-- ------------------------------------------------------------
CREATE TABLE profiles (
  id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name       VARCHAR(100),
  preferred_currency VARCHAR(5) NOT NULL DEFAULT 'BRL',
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Asset classes (definidas pelo usuário)
-- ------------------------------------------------------------
CREATE TABLE asset_classes (
  id         SERIAL PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       VARCHAR(50) NOT NULL,
  color      VARCHAR(7)  NOT NULL DEFAULT '#6B7280',
  target_pct DECIMAL(5,2),
  sort_order SMALLINT    DEFAULT 0,
  UNIQUE(user_id, name)
);

-- ------------------------------------------------------------
-- Assets (cadastro unificado dos 3 tipos)
-- ------------------------------------------------------------
CREATE TABLE assets (
  id           SERIAL PRIMARY KEY,
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code         VARCHAR(30)  NOT NULL,
  name         VARCHAR(150) NOT NULL,
  asset_type   VARCHAR(15)  NOT NULL CHECK (asset_type IN ('ticker','fixed_income','manual')),
  class_id     INTEGER      REFERENCES asset_classes(id) ON DELETE SET NULL,
  sector       VARCHAR(50),
  country      VARCHAR(30),
  currency     VARCHAR(5)   NOT NULL DEFAULT 'BRL',
  exchange     VARCHAR(30),

  -- Campos exclusivos: asset_type = 'ticker'
  ticker_brapi    VARCHAR(30),   -- ex: "PETR4", "HSML11"
  ticker_yahoo    VARCHAR(30),   -- ex: "PETR4.SA", "META", "BTC-USD"
  coingecko_id    VARCHAR(60),   -- ex: "bitcoin", "ethereum", "solana"

  -- Campos exclusivos: asset_type = 'fixed_income'
  fi_principal    DECIMAL(18,2), -- valor investido (aporte inicial)
  fi_start_date   DATE,          -- data de início da aplicação
  fi_type         VARCHAR(15) CHECK (fi_type IN ('pos_cdi','pre','ipca_plus','selic') OR fi_type IS NULL),
  fi_rate         DECIMAL(10,6), -- pós: multiplicador CDI (ex: 1.025); pré/híbrido: taxa a.a. decimal
  fi_spread       DECIMAL(10,6), -- híbrido IPCA+: taxa adicional a.a. decimal
  fi_maturity     DATE,          -- vencimento (opcional)

  active       BOOLEAN   DEFAULT TRUE,
  notes        TEXT,
  created_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, code)
);

-- ------------------------------------------------------------
-- Contributions — compras e vendas (apenas tipo ticker)
-- Tipo fixed_income usa o próprio aporte do cadastro.
-- ------------------------------------------------------------
CREATE TABLE contributions (
  id           SERIAL PRIMARY KEY,
  asset_id     INTEGER     NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  date         DATE        NOT NULL,
  type         VARCHAR(4)  NOT NULL DEFAULT 'buy' CHECK (type IN ('buy','sell')),
  quantity     DECIMAL(18,6) NOT NULL,
  price_orig   DECIMAL(18,6),         -- preço unitário na moeda do ativo
  currency     VARCHAR(5),
  fx_rate_brl  DECIMAL(10,6),         -- câmbio para BRL no momento da operação
  value_brl    DECIMAL(18,2),         -- calculado: qty × price × fx_rate
  description  TEXT,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Price history — cache de cotações (tipo ticker)
-- Preenchida automaticamente pelos jobs de busca de preço.
-- ------------------------------------------------------------
CREATE TABLE price_history (
  id          SERIAL PRIMARY KEY,
  asset_id    INTEGER       NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  ref_date    DATE          NOT NULL,
  price       DECIMAL(18,6) NOT NULL,   -- preço na moeda do ativo
  currency    VARCHAR(5)    NOT NULL,
  source      VARCHAR(20),              -- 'brapi' | 'yahoo' | 'coingecko'
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(asset_id, ref_date)
);

-- ------------------------------------------------------------
-- Manual values — valor total mensal (tipo manual)
-- Usuário informa o saldo total no dia 1 de cada mês.
-- ------------------------------------------------------------
CREATE TABLE manual_values (
  id          SERIAL PRIMARY KEY,
  asset_id    INTEGER       NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  ref_date    DATE          NOT NULL,           -- sempre dia 1 do mês
  value       DECIMAL(18,2) NOT NULL,
  currency    VARCHAR(5)    NOT NULL DEFAULT 'BRL',
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(asset_id, ref_date)
);

-- ------------------------------------------------------------
-- FX rates — cache de câmbio (AwesomeAPI)
-- Pares genéricos: USD/BRL, EUR/BRL, EUR/USD, etc.
-- ------------------------------------------------------------
CREATE TABLE fx_rates (
  id            SERIAL PRIMARY KEY,
  ref_date      DATE        NOT NULL,
  from_currency VARCHAR(5)  NOT NULL,
  to_currency   VARCHAR(5)  NOT NULL,
  rate          DECIMAL(18,6) NOT NULL,
  source        VARCHAR(20) DEFAULT 'awesomeapi',
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(ref_date, from_currency, to_currency)
);

-- ------------------------------------------------------------
-- BCB rates — séries históricas do Banco Central
-- CDI diário e IPCA mensal para cálculo de Renda Fixa.
-- ------------------------------------------------------------
CREATE TABLE bcb_rates (
  id          SERIAL PRIMARY KEY,
  ref_date    DATE          NOT NULL,
  series_code INTEGER       NOT NULL,   -- 12=CDI diário, 433=IPCA mensal, 1178=Selic diária
  value       DECIMAL(18,8) NOT NULL,   -- valor da série no período
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(ref_date, series_code)
);

-- ------------------------------------------------------------
-- Benchmarks — pontuação histórica de índices de mercado
-- ------------------------------------------------------------
CREATE TABLE benchmarks (
  id           SERIAL PRIMARY KEY,
  ref_date     DATE          NOT NULL,
  ibov         DECIMAL(18,2),
  sp500        DECIMAL(18,2),
  cdi_monthly  DECIMAL(10,6),
  ipca_monthly DECIMAL(10,6),
  UNIQUE(ref_date)
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_classes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_values  ENABLE ROW LEVEL SECURITY;

-- Dados públicos (não precisam de RLS por usuário)
ALTER TABLE fx_rates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bcb_rates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarks     ENABLE ROW LEVEL SECURITY;

-- Políticas por usuário
CREATE POLICY "profiles_own"      ON profiles      FOR ALL USING (auth.uid() = id);
CREATE POLICY "classes_own"       ON asset_classes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "assets_own"        ON assets        FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "contributions_own" ON contributions FOR ALL USING (
  EXISTS (SELECT 1 FROM assets WHERE assets.id = contributions.asset_id AND assets.user_id = auth.uid())
);
CREATE POLICY "price_history_own" ON price_history FOR ALL USING (
  EXISTS (SELECT 1 FROM assets WHERE assets.id = price_history.asset_id AND assets.user_id = auth.uid())
);
CREATE POLICY "manual_values_own" ON manual_values FOR ALL USING (
  EXISTS (SELECT 1 FROM assets WHERE assets.id = manual_values.asset_id AND assets.user_id = auth.uid())
);

-- Leitura pública para dados de mercado
CREATE POLICY "fx_read"        ON fx_rates   FOR SELECT USING (true);
CREATE POLICY "bcb_read"       ON bcb_rates  FOR SELECT USING (true);
CREATE POLICY "bench_read"     ON benchmarks FOR SELECT USING (true);

-- Apenas service_role escreve dados de mercado
CREATE POLICY "fx_write_svc"   ON fx_rates   FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "bcb_write_svc"  ON bcb_rates  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "bench_write_svc" ON benchmarks FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Trigger: cria profile ao registrar usuário
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
