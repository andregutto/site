-- Seed: 57 ativos do portfólio André Gutto
-- Depende de 001_asset_classes.sql
-- Manuais: NATIXIS, REVOLUT
-- Renda Fixa: CDB C6, CDB BTG, NTN-B 35, NTN-B P35, NTN-B 45
-- Tickers: todos os demais (ações, FIIs, ETFs, cripto)

DO $$
DECLARE
  uid         UUID    := (SELECT id FROM auth.users LIMIT 1);
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
    (uid,'HSML11','HSI Malls FII',            'ticker',cls_fiis,'Shopping', 'Brasil','BRL','XP','HSML11','HSML11.SA'),
    (uid,'VISC11','Vinci Shopping Centers FII','ticker',cls_fiis,'Shopping', 'Brasil','BRL','XP','VISC11','VISC11.SA'),
    (uid,'BTHF11','BTG Real Estate HF FII',   'ticker',cls_fiis,'Hotel',    'Brasil','BRL','XP','BTHF11','BTHF11.SA'),
    (uid,'HTMX11','FII Hotel Maxinvest',       'ticker',cls_fiis,'Hotel',    'Brasil','BRL','XP','HTMX11','HTMX11.SA'),
    (uid,'TRBL11','Tellus Rio Bravo Log. FII', 'ticker',cls_fiis,'Logística','Brasil','BRL','XP','TRBL11','TRBL11.SA'),
    (uid,'LVBI11','VBI Logístico FII',         'ticker',cls_fiis,'Logística','Brasil','BRL','XP','LVBI11','LVBI11.SA'),
    (uid,'PMLL11','Patria Malls FII',          'ticker',cls_fiis,'Shopping', 'Brasil','BRL','XP','PMLL11','PMLL11.SA')
  ON CONFLICT (user_id, code) DO NOTHING;

  -- -------------------------------------------------------
  -- Ações Brasil — ticker (brapi)
  -- -------------------------------------------------------
  INSERT INTO assets (user_id, code, name, asset_type, class_id, sector, country, currency, exchange, ticker_brapi, ticker_yahoo) VALUES
    (uid,'ITSA3', 'Itaúsa SA',              'ticker',cls_acoes,'Financeiro', 'Brasil','BRL','XP', 'ITSA3', 'ITSA3.SA'),
    (uid,'WEGE3', 'Weg SA',                 'ticker',cls_acoes,'Tecnologia', 'Brasil','BRL','XP', 'WEGE3', 'WEGE3.SA'),
    (uid,'KLBN11','Klabin SA Unit',         'ticker',cls_acoes,'Papel',      'Brasil','BRL','XP', 'KLBN11','KLBN11.SA'),
    (uid,'SBSP3', 'Cia Saneamento Básico SP','ticker',cls_acoes,'Saneamento','Brasil','BRL','XP', 'SBSP3', 'SBSP3.SA'),
    (uid,'SAPR3', 'Sanepar SA',             'ticker',cls_acoes,'Saneamento','Brasil','BRL','XP', 'SAPR3', 'SAPR3.SA'),
    (uid,'BBDC3', 'Banco Bradesco SA',      'ticker',cls_acoes,'Financeiro', 'Brasil','BRL','XP', 'BBDC3', 'BBDC3.SA'),
    (uid,'VALE3', 'Vale SA',                'ticker',cls_acoes,'Metais',     'Brasil','BRL','XP', 'VALE3', 'VALE3.SA'),
    (uid,'PETR4', 'Petrobras PN',           'ticker',cls_acoes,'Petróleo',   'Brasil','BRL','XP', 'PETR4', 'PETR4.SA'),
    (uid,'CMIG3', 'CEMIG SA',               'ticker',cls_acoes,'Energia',    'Brasil','BRL','XP', 'CMIG3', 'CMIG3.SA'),
    (uid,'TAEE3', 'Taesa SA',               'ticker',cls_acoes,'Energia',    'Brasil','BRL','XP', 'TAEE3', 'TAEE3.SA'),
    (uid,'SANB3', 'Banco Santander Brasil', 'ticker',cls_acoes,'Banco',      'Brasil','BRL','XP', 'SANB3', 'SANB3.SA'),
    (uid,'BBSE3', 'BB Seguridade SA',       'ticker',cls_acoes,'Seguros',    'Brasil','BRL','XP', 'BBSE3', 'BBSE3.SA'),
    (uid,'SMAL11','iShares Small Cap ETF',  'ticker',cls_acoes,'Small Caps', 'Brasil','BRL','XP', 'SMAL11','SMAL11.SA'),
    (uid,'MULT3', 'Multiplan SA',           'ticker',cls_acoes,'Shopping',   'Brasil','BRL','XP', 'MULT3', 'MULT3.SA'),
    (uid,'ABCB4', 'Banco ABC Brasil',       'ticker',cls_acoes,'Financeiro', 'Brasil','BRL','XP', 'ABCB4', 'ABCB4.SA'),
    (uid,'RANI3', 'Irani Papel e Embalagem','ticker',cls_acoes,'Papel',      'Brasil','BRL','XP', 'RANI3', 'RANI3.SA'),
    (uid,'TARPON','Tarpon GT FIC FIA',      'ticker',cls_acoes,'Fundo',      'Brasil','BRL','BTG','TARPON',NULL)
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
    (uid,'NATIXIS','Previdência NATIXIS', 'manual',cls_prev,'França','EUR','Natixis')
  ON CONFLICT (user_id, code) DO NOTHING;

  -- -------------------------------------------------------
  -- Exterior USA — ticker (Yahoo Finance)
  -- -------------------------------------------------------
  INSERT INTO assets (user_id, code, name, asset_type, class_id, sector, country, currency, exchange, ticker_yahoo) VALUES
    (uid,'META', 'Meta Platforms',            'ticker',cls_ext,'Tecnologia',    'USA','USD','Interactive Brokers','META'),
    (uid,'AAPL', 'Apple Inc',                 'ticker',cls_ext,'Tecnologia',    'USA','USD','Interactive Brokers','AAPL'),
    (uid,'AMZN', 'Amazon.com',                'ticker',cls_ext,'Consumo',       'USA','USD','Interactive Brokers','AMZN'),
    (uid,'DIS',  'Walt Disney',               'ticker',cls_ext,'Entretenimento','USA','USD','Interactive Brokers','DIS'),
    (uid,'GOOGL','Alphabet Inc',              'ticker',cls_ext,'Tecnologia',    'USA','USD','Interactive Brokers','GOOGL'),
    (uid,'JPM',  'JPMorgan Chase',            'ticker',cls_ext,'Financeiro',    'USA','USD','Interactive Brokers','JPM'),
    (uid,'NFLX', 'Netflix Inc',               'ticker',cls_ext,'Entretenimento','USA','USD','Interactive Brokers','NFLX'),
    (uid,'TSM',  'Taiwan Semiconductor',      'ticker',cls_ext,'Tecnologia',    'USA','USD','Interactive Brokers','TSM'),
    (uid,'KO',   'Coca-Cola Co',              'ticker',cls_ext,'Alimentos',     'USA','USD','Interactive Brokers','KO'),
    (uid,'V',    'Visa Inc',                  'ticker',cls_ext,'Financeiro',    'USA','USD','Interactive Brokers','V'),
    (uid,'MSFT', 'Microsoft Corp',            'ticker',cls_ext,'Tecnologia',    'USA','USD','Interactive Brokers','MSFT'),
    (uid,'CRM',  'Salesforce Inc',            'ticker',cls_ext,'Tecnologia',    'USA','USD','Interactive Brokers','CRM'),
    (uid,'NKE',  'Nike Inc',                  'ticker',cls_ext,'Consumo',       'USA','USD','Interactive Brokers','NKE'),
    (uid,'TSLA', 'Tesla Inc',                 'ticker',cls_ext,'Tecnologia',    'USA','USD','Interactive Brokers','TSLA'),
    (uid,'MCD',  'McDonald''s Corp',          'ticker',cls_ext,'Consumo',       'USA','USD','Interactive Brokers','MCD'),
    (uid,'JNJ',  'Johnson & Johnson',         'ticker',cls_ext,'Saúde',         'USA','USD','Interactive Brokers','JNJ'),
    (uid,'IVV',  'iShares S&P 500 ETF',       'ticker',cls_ext,'Índice',        'USA','USD','Interactive Brokers','IVV'),
    (uid,'IJS',  'iShares SmallCap Value ETF','ticker',cls_ext,'Small Caps',    'USA','USD','Interactive Brokers','IJS'),
    (uid,'VNQ',  'Vanguard Real Estate ETF',  'ticker',cls_ext,'Imobiliário',   'USA','USD','Interactive Brokers','VNQ'),
    (uid,'IAU',  'iShares Gold Trust',        'ticker',cls_ext,'Ouro',          'USA','USD','Interactive Brokers','IAU'),
    (uid,'VUG',  'Vanguard Growth ETF',       'ticker',cls_ext,'Índice',        'USA','USD','Interactive Brokers','VUG'),
    (uid,'VGT',  'Vanguard IT Index ETF',     'ticker',cls_ext,'Tecnologia',    'USA','USD','Interactive Brokers','VGT'),
    (uid,'AGG',  'iShares US Bond ETF',       'ticker',cls_ext,'Renda Fixa',    'USA','USD','Interactive Brokers','AGG')
  ON CONFLICT (user_id, code) DO NOTHING;

END $$;
