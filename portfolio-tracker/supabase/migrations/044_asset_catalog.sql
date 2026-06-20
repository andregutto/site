-- Catálogo global de ativos negociáveis (ações, ETFs, cripto) — compartilhado
-- entre todos os usuários, permite no futuro agregar composição de carteiras
-- entre usuários (ex: "X% dos usuários têm o ETF Y"). Renda fixa/imóvel/manual
-- continuam livres por usuário (não têm uma entidade canônica do mundo real).
CREATE TABLE asset_catalog (
  id           SERIAL PRIMARY KEY,
  kind         VARCHAR(10)  NOT NULL CHECK (kind IN ('b3','intl','cripto')),
  symbol       VARCHAR(40)  NOT NULL, -- chave canônica: ticker_brapi (b3) | ticker_yahoo (intl) | coingecko_id (cripto)
  name         VARCHAR(150) NOT NULL,
  exchange     VARCHAR(40),
  quote_type   VARCHAR(20),           -- 'ETF' | 'EQUITY' | 'CRYPTOCURRENCY' | 'fund' | 'stock' etc — informativo
  currency     VARCHAR(5),
  ticker_brapi VARCHAR(30),
  ticker_yahoo VARCHAR(30),
  coingecko_id VARCHAR(60),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, symbol)
);

ALTER TABLE assets ADD COLUMN catalog_id INTEGER REFERENCES asset_catalog(id) ON DELETE SET NULL;
CREATE INDEX idx_assets_catalog_id ON assets(catalog_id);

-- Leitura pública (qualquer usuário autenticado pode ver o catálogo inteiro —
-- é compartilhado, não tem dado pessoal); escrita só via service_role (backend).
ALTER TABLE asset_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_read_all" ON asset_catalog FOR SELECT TO authenticated USING (true);
