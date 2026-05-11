-- Seed: Posições iniciais como contribuições de compra (ticker assets)
-- Representa o custo médio histórico como uma única entrada "buy"
-- Usuário pode adicionar histórico detalhado depois
-- Ativos sem avg_cost no briefing são omitidos aqui

DO $$
DECLARE
  uid UUID := (SELECT id FROM auth.users LIMIT 1);
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
