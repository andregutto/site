-- Atualiza campo exchange para os ativos existentes de André
-- Execute no SQL Editor do Supabase (dashboard.supabase.com)

DO $$
DECLARE
  uid UUID := '453bc770-0cea-4c88-b72f-babf9e50437e';
BEGIN
  -- FIIs → XP
  UPDATE assets SET exchange = 'XP'
  WHERE user_id = uid
    AND code IN ('HSML11','VISC11','BTHF11','HTMX11','TRBL11','LVBI11','PMLL11');

  -- Ações Brasil → XP
  UPDATE assets SET exchange = 'XP'
  WHERE user_id = uid
    AND code IN ('ITSA3','WEGE3','KLBN11','SBSP3','SAPR3','BBDC3','VALE3','PETR4',
                 'CMIG3','TAEE3','SANB3','BBSE3','SMAL11','MULT3','ABCB4','RANI3');

  -- Fundo BTG
  UPDATE assets SET exchange = 'BTG' WHERE user_id = uid AND code = 'TARPON';

  -- Cripto → Exodus
  UPDATE assets SET exchange = 'Exodus'
  WHERE user_id = uid AND code IN ('BTC','ETH','SOL');

  -- Ações e ETFs USA → Interactive Brokers
  UPDATE assets SET exchange = 'Interactive Brokers'
  WHERE user_id = uid
    AND code IN ('META','AAPL','AMZN','DIS','GOOGL','JPM','NFLX','TSM','KO','V',
                 'MSFT','CRM','NKE','TSLA','MCD','JNJ','IVV','IJS','VNQ','IAU','VUG','VGT','AGG');

  -- Renda Fixa
  UPDATE assets SET exchange = 'C6'  WHERE user_id = uid AND code = 'CDB C6';
  UPDATE assets SET exchange = 'BTG' WHERE user_id = uid AND code = 'CDB BTG';
  UPDATE assets SET exchange = 'XP'  WHERE user_id = uid AND code IN ('NTN-B 35','NTN-B P35','NTN-B 45');

  -- Manuais
  UPDATE assets SET exchange = 'Natixis' WHERE user_id = uid AND code = 'NATIXIS';
  UPDATE assets SET exchange = 'Revolut' WHERE user_id = uid AND code = 'REVOLUT';
END $$;
