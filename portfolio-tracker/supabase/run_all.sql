-- ============================================================
-- MIGRATION 001 + SEEDS (UUID: 453bc770-0cea-4c88-b72f-babf9e50437e)
-- ============================================================

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

-- ============================================================
-- SEED 001 — Asset Classes
-- ============================================================
-- Seed: Classes de ativos do portfólio do André
-- Execute APÓS criar o usuário via Supabase Auth
-- Substitua USER_ID pelo UUID do usuário criado

DO $$
DECLARE
  uid UUID := '453bc770-0cea-4c88-b72f-babf9e50437e'::UUID; -- ajustar para UUID real
BEGIN
  INSERT INTO asset_classes (user_id, name, color, target_pct, sort_order) VALUES
    (uid, 'FIIs',           '#2E75B6', NULL,  1),
    (uid, 'Ações Brasil',   '#1F4E79', 25.00, 2),
    (uid, 'Cripto',         '#7030A0', 25.00, 3),
    (uid, 'Renda Fixa',     '#375623', 15.00, 4),
    (uid, 'Exterior',       '#843C0C', 25.00, 5),
    (uid, 'Previdência',    '#7F6000',  5.00, 6)
  ON CONFLICT (user_id, name) DO NOTHING;
END $$;

-- ============================================================
-- SEED 002 — Assets (57 ativos)
-- ============================================================
-- Seed: 57 ativos do portfólio André Gutto
-- Depende de 001_asset_classes.sql
-- Manuais: NATIXIS, REVOLUT
-- Renda Fixa: CDB C6, CDB BTG, NTN-B 35, NTN-B P35, NTN-B 45
-- Tickers: todos os demais (ações, FIIs, ETFs, cripto)

DO $$
DECLARE
  uid         UUID    := '453bc770-0cea-4c88-b72f-babf9e50437e'::UUID;
  cls_fiis    INTEGER; cls_acoes   INTEGER; cls_cripto  INTEGER;
  cls_rf      INTEGER; cls_ext     INTEGER; cls_prev    INTEGER;
BEGIN
  SELECT id INTO cls_fiis  FROM asset_classes WHERE user_id=uid AND name='FIIs';
  SELECT id INTO cls_acoes FROM asset_classes WHERE user_id=uid AND name='Ações Brasil';
  SELECT id INTO cls_cripto FROM asset_classes WHERE user_id=uid AND name='Cripto';
  SELECT id INTO cls_rf    FROM asset_classes WHERE user_id=uid AND name='Renda Fixa';
  SELECT id INTO cls_ext   FROM asset_classes WHERE user_id=uid AND name='Exterior';
  SELECT id INTO cls_prev  FROM asset_classes WHERE user_id=uid AND name='Previdência';

  -- -------------------------------------------------------
  -- FIIs — ticker (brapi)
  -- -------------------------------------------------------
  INSERT INTO assets (user_id, code, name, asset_type, class_id, sector, country, currency, exchange, ticker_brapi, ticker_yahoo) VALUES
    (uid,'HSML11','HSI Malls FII',            'ticker',cls_fiis,'Shopping', 'Brasil','BRL','BVMF','HSML11','HSML11.SA'),
    (uid,'VISC11','Vinci Shopping Centers FII','ticker',cls_fiis,'Shopping', 'Brasil','BRL','BVMF','VISC11','VISC11.SA'),
    (uid,'BTHF11','BTG Real Estate HF FII',   'ticker',cls_fiis,'Hotel',    'Brasil','BRL','BVMF','BTHF11','BTHF11.SA'),
    (uid,'HTMX11','FII Hotel Maxinvest',       'ticker',cls_fiis,'Hotel',    'Brasil','BRL','BVMF','HTMX11','HTMX11.SA'),
    (uid,'TRBL11','Tellus Rio Bravo Log. FII', 'ticker',cls_fiis,'Logística','Brasil','BRL','BVMF','TRBL11','TRBL11.SA'),
    (uid,'LVBI11','VBI Logístico FII',         'ticker',cls_fiis,'Logística','Brasil','BRL','BVMF','LVBI11','LVBI11.SA'),
    (uid,'PMLL11','Patria Malls FII',          'ticker',cls_fiis,'Shopping', 'Brasil','BRL','BVMF','PMLL11','PMLL11.SA')
  ON CONFLICT (user_id, code) DO NOTHING;

  -- -------------------------------------------------------
  -- Ações Brasil — ticker (brapi)
  -- -------------------------------------------------------
  INSERT INTO assets (user_id, code, name, asset_type, class_id, sector, country, currency, exchange, ticker_brapi, ticker_yahoo) VALUES
    (uid,'ITSA3', 'Itaúsa SA',              'ticker',cls_acoes,'Financeiro', 'Brasil','BRL','BVMF','ITSA3', 'ITSA3.SA'),
    (uid,'WEGE3', 'Weg SA',                 'ticker',cls_acoes,'Tecnologia', 'Brasil','BRL','BVMF','WEGE3', 'WEGE3.SA'),
    (uid,'KLBN11','Klabin SA Unit',         'ticker',cls_acoes,'Papel',      'Brasil','BRL','BVMF','KLBN11','KLBN11.SA'),
    (uid,'SBSP3', 'Cia Saneamento Básico SP','ticker',cls_acoes,'Saneamento','Brasil','BRL','BVMF','SBSP3', 'SBSP3.SA'),
    (uid,'SAPR3', 'Sanepar SA',             'ticker',cls_acoes,'Saneamento','Brasil','BRL','BVMF','SAPR3', 'SAPR3.SA'),
    (uid,'BBDC3', 'Banco Bradesco SA',      'ticker',cls_acoes,'Financeiro', 'Brasil','BRL','BVMF','BBDC3', 'BBDC3.SA'),
    (uid,'VALE3', 'Vale SA',                'ticker',cls_acoes,'Metais',     'Brasil','BRL','BVMF','VALE3', 'VALE3.SA'),
    (uid,'PETR4', 'Petrobras PN',           'ticker',cls_acoes,'Petróleo',   'Brasil','BRL','BVMF','PETR4', 'PETR4.SA'),
    (uid,'CMIG3', 'CEMIG SA',               'ticker',cls_acoes,'Energia',    'Brasil','BRL','BVMF','CMIG3', 'CMIG3.SA'),
    (uid,'TAEE3', 'Taesa SA',               'ticker',cls_acoes,'Energia',    'Brasil','BRL','BVMF','TAEE3', 'TAEE3.SA'),
    (uid,'SANB3', 'Banco Santander Brasil', 'ticker',cls_acoes,'Banco',      'Brasil','BRL','BVMF','SANB3', 'SANB3.SA'),
    (uid,'BBSE3', 'BB Seguridade SA',       'ticker',cls_acoes,'Seguros',    'Brasil','BRL','BVMF','BBSE3', 'BBSE3.SA'),
    (uid,'SMAL11','iShares Small Cap ETF',  'ticker',cls_acoes,'Small Caps', 'Brasil','BRL','BVMF','SMAL11','SMAL11.SA'),
    (uid,'MULT3', 'Multiplan SA',           'ticker',cls_acoes,'Shopping',   'Brasil','BRL','BVMF','MULT3', 'MULT3.SA'),
    (uid,'ABCB4', 'Banco ABC Brasil',       'ticker',cls_acoes,'Financeiro', 'Brasil','BRL','BVMF','ABCB4', 'ABCB4.SA'),
    (uid,'RANI3', 'Irani Papel e Embalagem','ticker',cls_acoes,'Papel',      'Brasil','BRL','BVMF','RANI3', 'RANI3.SA'),
    (uid,'TARPON','Tarpon GT FIC FIA',      'ticker',cls_acoes,'Fundo',      'Brasil','BRL','BTG', 'TARPON',NULL)
  ON CONFLICT (user_id, code) DO NOTHING;

  -- -------------------------------------------------------
  -- Cripto — ticker (CoinGecko)
  -- -------------------------------------------------------
  INSERT INTO assets (user_id, code, name, asset_type, class_id, country, currency, exchange, ticker_yahoo, coingecko_id) VALUES
    (uid,'BTC','Bitcoin',  'ticker',cls_cripto,'Global','USD','Exodus','BTC-USD','bitcoin'),
    (uid,'ETH','Ethereum', 'ticker',cls_cripto,'Global','USD','Exodus','ETH-USD','ethereum'),
    (uid,'SOL','Solana',   'ticker',cls_cripto,'Global','USD','Exodus','SOL-USD','solana')
  ON CONFLICT (user_id, code) DO NOTHING;

  -- -------------------------------------------------------
  -- Renda Fixa — fixed_income (cálculo via BCB)
  -- Valores de principal são aproximações; usuário ajusta.
  -- fi_rate para pós-fixado = multiplicador CDI (1.025 = 102,5% CDI)
  -- fi_rate para pré/híbrido = taxa a.a. decimal (0.125 = 12,5% a.a.)
  -- -------------------------------------------------------
  INSERT INTO assets (user_id, code, name, asset_type, class_id, country, currency, exchange,
                      fi_principal, fi_start_date, fi_type, fi_rate, fi_spread, fi_maturity) VALUES
    (uid,'CDB C6',   'CDB C6 102,5% CDI',           'fixed_income',cls_rf,'Brasil','BRL','C6',
     202421.35,'2023-01-01','pos_cdi',1.025,NULL,NULL),

    (uid,'CDB BTG',  'CDB BTG',                      'fixed_income',cls_rf,'Brasil','BRL','BTG',
     NULL,NULL,'pos_cdi',1.00,NULL,NULL),

    (uid,'NTN-B 35', 'Tesouro IPCA+ c/Juros 2035',   'fixed_income',cls_rf,'Brasil','BRL','XP',
     NULL,'2023-01-01','ipca_plus',NULL,0.0650,'2035-05-15'),

    (uid,'NTN-B P35','Tesouro NTNB Princ 2035',      'fixed_income',cls_rf,'Brasil','BRL','XP',
     NULL,'2023-01-01','ipca_plus',NULL,0.0650,'2035-05-15'),

    (uid,'NTN-B 45', 'Tesouro IPCA+ 2045',            'fixed_income',cls_rf,'Brasil','BRL','XP',
     NULL,'2023-01-01','ipca_plus',NULL,0.0650,'2045-05-15')
  ON CONFLICT (user_id, code) DO NOTHING;

  -- -------------------------------------------------------
  -- Manual — sem cotação pública
  -- -------------------------------------------------------
  INSERT INTO assets (user_id, code, name, asset_type, class_id, country, currency, exchange) VALUES
    (uid,'REVOLUT','Saldo Revolut (EUR)', 'manual',cls_rf,  'Europa','EUR','Revolut'),
    (uid,'NATIXIS','Previdência NATIXIS', 'manual',cls_prev,'França','EUR','NATIXIS')
  ON CONFLICT (user_id, code) DO NOTHING;

  -- -------------------------------------------------------
  -- Exterior USA — ticker (Yahoo Finance)
  -- -------------------------------------------------------
  INSERT INTO assets (user_id, code, name, asset_type, class_id, sector, country, currency, exchange, ticker_yahoo) VALUES
    (uid,'META', 'Meta Platforms',            'ticker',cls_ext,'Tecnologia',    'USA','USD','IB','META'),
    (uid,'AAPL', 'Apple Inc',                 'ticker',cls_ext,'Tecnologia',    'USA','USD','IB','AAPL'),
    (uid,'AMZN', 'Amazon.com',                'ticker',cls_ext,'Consumo',       'USA','USD','IB','AMZN'),
    (uid,'DIS',  'Walt Disney',               'ticker',cls_ext,'Entretenimento','USA','USD','IB','DIS'),
    (uid,'GOOGL','Alphabet Inc',              'ticker',cls_ext,'Tecnologia',    'USA','USD','IB','GOOGL'),
    (uid,'JPM',  'JPMorgan Chase',            'ticker',cls_ext,'Financeiro',    'USA','USD','IB','JPM'),
    (uid,'NFLX', 'Netflix Inc',               'ticker',cls_ext,'Entretenimento','USA','USD','IB','NFLX'),
    (uid,'TSM',  'Taiwan Semiconductor',      'ticker',cls_ext,'Tecnologia',    'USA','USD','IB','TSM'),
    (uid,'KO',   'Coca-Cola Co',              'ticker',cls_ext,'Alimentos',     'USA','USD','IB','KO'),
    (uid,'V',    'Visa Inc',                  'ticker',cls_ext,'Financeiro',    'USA','USD','IB','V'),
    (uid,'MSFT', 'Microsoft Corp',            'ticker',cls_ext,'Tecnologia',    'USA','USD','IB','MSFT'),
    (uid,'CRM',  'Salesforce Inc',            'ticker',cls_ext,'Tecnologia',    'USA','USD','IB','CRM'),
    (uid,'NKE',  'Nike Inc',                  'ticker',cls_ext,'Consumo',       'USA','USD','IB','NKE'),
    (uid,'TSLA', 'Tesla Inc',                 'ticker',cls_ext,'Tecnologia',    'USA','USD','IB','TSLA'),
    (uid,'MCD',  'McDonald''s Corp',          'ticker',cls_ext,'Consumo',       'USA','USD','IB','MCD'),
    (uid,'JNJ',  'Johnson & Johnson',         'ticker',cls_ext,'Saúde',         'USA','USD','IB','JNJ'),
    (uid,'IVV',  'iShares S&P 500 ETF',       'ticker',cls_ext,'Índice',        'USA','USD','IB','IVV'),
    (uid,'IJS',  'iShares SmallCap Value ETF','ticker',cls_ext,'Small Caps',    'USA','USD','IB','IJS'),
    (uid,'VNQ',  'Vanguard Real Estate ETF',  'ticker',cls_ext,'Imobiliário',   'USA','USD','IB','VNQ'),
    (uid,'IAU',  'iShares Gold Trust',        'ticker',cls_ext,'Ouro',          'USA','USD','IB','IAU'),
    (uid,'VUG',  'Vanguard Growth ETF',       'ticker',cls_ext,'Índice',        'USA','USD','IB','VUG'),
    (uid,'VGT',  'Vanguard IT Index ETF',     'ticker',cls_ext,'Tecnologia',    'USA','USD','IB','VGT'),
    (uid,'AGG',  'iShares US Bond ETF',       'ticker',cls_ext,'Renda Fixa',    'USA','USD','IB','AGG')
  ON CONFLICT (user_id, code) DO NOTHING;

END $$;

-- ============================================================
-- SEED 004 — Contributions
-- ============================================================
-- Seed: Posições iniciais como contribuições de compra (ticker assets)
-- Representa o custo médio histórico como uma única entrada "buy"
-- Usuário pode adicionar histórico detalhado depois
-- Ativos sem avg_cost no briefing são omitidos aqui

DO $$
DECLARE
  uid UUID := '453bc770-0cea-4c88-b72f-babf9e50437e'::UUID;
  aid INTEGER;
BEGIN

  -- -------------------------------------------------------
  -- FIIs
  -- -------------------------------------------------------
  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='HSML11';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',101,91.12,'BRL',101*91.12) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='VISC11';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',64,104.21,'BRL',64*104.21) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='BTHF11';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',652,9.88,'BRL',652*9.88) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='HTMX11';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',30,95.20,'BRL',30*95.20) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='TRBL11';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',30,87.64,'BRL',30*87.64) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='LVBI11';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',15,101.22,'BRL',15*101.22) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='PMLL11';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',9,103.80,'BRL',9*103.80) ON CONFLICT DO NOTHING;

  -- -------------------------------------------------------
  -- Ações Brasil (apenas com avg_cost disponível)
  -- -------------------------------------------------------
  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='WEGE3';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',400,34.94,'BRL',400*34.94) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='KLBN11';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',990,19.51,'BRL',990*19.51) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='SBSP3';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',200,58.61,'BRL',200*58.61) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='BBDC3';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',900,11.71,'BRL',900*11.71) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='PETR4';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',300,18.08,'BRL',300*18.08) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='CMIG3';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',1264,11.93,'BRL',1264*11.93) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='SANB3';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',700,12.50,'BRL',700*12.50) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='BBSE3';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',617,28.64,'BRL',617*28.64) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='SMAL11';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',50,93.29,'BRL',50*93.29) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='MULT3';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',200,21.09,'BRL',200*21.09) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='ABCB4';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',200,19.31,'BRL',200*19.31) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='RANI3';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',400,5.53,'BRL',400*5.53) ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='TARPON';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency,value_brl)
    VALUES (aid,'2023-01-01','buy',1,20001.66,'BRL',20001.66) ON CONFLICT DO NOTHING;

  -- Ações sem avg_cost: apenas quantidade, sem preço de custo
  -- ITSA3 (2153 unidades), SAPR3 (6400), VALE3 (800), TAEE3 (2300)
  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='ITSA3';
  INSERT INTO contributions (asset_id,date,type,quantity,currency)
    VALUES (aid,'2023-01-01','buy',2153,'BRL') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='SAPR3';
  INSERT INTO contributions (asset_id,date,type,quantity,currency)
    VALUES (aid,'2023-01-01','buy',6400,'BRL') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='VALE3';
  INSERT INTO contributions (asset_id,date,type,quantity,currency)
    VALUES (aid,'2023-01-01','buy',800,'BRL') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='TAEE3';
  INSERT INTO contributions (asset_id,date,type,quantity,currency)
    VALUES (aid,'2023-01-01','buy',2300,'BRL') ON CONFLICT DO NOTHING;

  -- -------------------------------------------------------
  -- Cripto (quantidade real da carteira Exodus)
  -- -------------------------------------------------------
  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='BTC';
  INSERT INTO contributions (asset_id,date,type,quantity,currency)
    VALUES (aid,'2023-01-01','buy',0.42833,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='ETH';
  INSERT INTO contributions (asset_id,date,type,quantity,currency)
    VALUES (aid,'2023-01-01','buy',1.38054,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='SOL';
  INSERT INTO contributions (asset_id,date,type,quantity,currency)
    VALUES (aid,'2023-01-01','buy',18.6938,'USD') ON CONFLICT DO NOTHING;

  -- -------------------------------------------------------
  -- Exterior USA (com avg_cost em USD)
  -- -------------------------------------------------------
  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='META';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',16,191.64,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='AAPL';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',27,145.53,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='AMZN';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',21,119.78,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='DIS';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',39,112.60,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='GOOGL';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',21,102.42,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='JPM';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',11,134.14,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='NFLX';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',3,184.32,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='TSM';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',10,90.77,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='KO';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',19,51.52,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='V';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',4,207.68,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='MSFT';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',3,234.70,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='CRM';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',4,220.14,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='NKE';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',13,122.46,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='TSLA';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',4,219.09,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='MCD';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',3,267.66,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='JNJ';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',3,173.76,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='IVV';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',10,395.97,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='IJS';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',19,80.00,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='VNQ';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',20,87.17,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='IAU';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',36,33.13,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='VUG';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',3,391.01,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='VGT';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',3,601.66,'USD') ON CONFLICT DO NOTHING;

  SELECT id INTO aid FROM assets WHERE user_id=uid AND code='AGG';
  INSERT INTO contributions (asset_id,date,type,quantity,price_orig,currency)
    VALUES (aid,'2023-01-01','buy',10,98.91,'USD') ON CONFLICT DO NOTHING;

END $$;
