-- Migration 027: Complete default setup at signup — mirrors André's current profile
--
-- Asset classes (7, same as André has today):
--   Ações Brasil · Ações no Exterior · Imóveis · Cripto · Renda Fixa · Previdência · Caixa
--
--   Caixa = liquidez diária (CDBs D0, conta corrente) — frontend mostra "Liquidités" (FR)
--   Renda Fixa = ativos com prazo/vencimento, sem resgate antecipado
--   Imóveis = FIIs e imóveis físicos (era chamado "FIIs" no seed antigo)
--
-- Envelopes + categorias espelham o perfil do André.
-- Unique indexes evitam duplicatas se o trigger rodar mais de uma vez.

-- ── Unique indexes ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_classes_user_name_key
  ON asset_classes (user_id, name_key) WHERE name_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_envelopes_user_name_key
  ON finance_envelopes (user_id, name_key) WHERE name_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_categories_user_name_key
  ON finance_categories (user_id, name_key) WHERE name_key IS NOT NULL;

-- ── Updated trigger ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_env_ess  INT;
  v_env_inv  INT;
  v_env_non  INT;
  v_env_tor  INT;
  v_env_inc  INT;
BEGIN
  -- Profile
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  -- ── 7 asset classes (frontend traduz via name_key i18n) ──────────────────
  INSERT INTO public.asset_classes (user_id, name, color, name_key, sort_order) VALUES
    (NEW.id, 'Ações Brasil',     '#10b981', 'classAcoesBrasil',   1),
    (NEW.id, 'Ações no Exterior','#3b82f6', 'classAcoesExterior', 2),
    (NEW.id, 'Imóveis',          '#f59e0b', 'classImoveis',       3),
    (NEW.id, 'Cripto',           '#f97316', 'classCripto',        4),
    (NEW.id, 'Renda Fixa',       '#06b6d4', 'classRendaFixa',     5),
    (NEW.id, 'Previdência',      '#8b5cf6', 'classPrevidencia',   6),
    (NEW.id, 'Caixa',            '#6B7280', 'classCaixa',         7);

  -- ── Finance income placeholder ─────────────────────────────────────────────
  INSERT INTO public.finance_income (user_id, monthly_net, currency)
  VALUES (NEW.id, 0, 'EUR')
  ON CONFLICT (user_id) DO NOTHING;

  -- ── Envelopes (estrutura 50/30/10/10 do André) ────────────────────────────
  INSERT INTO public.finance_envelopes
    (user_id, name, name_key, pct_target, color, type, icon, sort_order)
  VALUES
    (NEW.id, 'Gastos Essenciais',     'envelopeEssential',    50, '#3b82f6', 'essential',  '🏠', 1),
    (NEW.id, 'Investimentos',         'envelopeInvestment',   30, '#10b981', 'investment', '📈', 2),
    (NEW.id, 'Gastos Não Essenciais', 'envelopeNonEssential', 10, '#ec4899', 'free',       '🎯', 3),
    (NEW.id, 'Torrar',                'envelopeTorrar',       10, '#a855f7', 'free',       '🎉', 4),
    (NEW.id, 'Rendas',                'envelopeIncome',        0, '#10b981', 'income',     '💰', 999);

  SELECT id INTO v_env_ess FROM public.finance_envelopes WHERE user_id = NEW.id AND name_key = 'envelopeEssential';
  SELECT id INTO v_env_inv FROM public.finance_envelopes WHERE user_id = NEW.id AND name_key = 'envelopeInvestment';
  SELECT id INTO v_env_non FROM public.finance_envelopes WHERE user_id = NEW.id AND name_key = 'envelopeNonEssential';
  SELECT id INTO v_env_tor FROM public.finance_envelopes WHERE user_id = NEW.id AND name_key = 'envelopeTorrar';
  SELECT id INTO v_env_inc FROM public.finance_envelopes WHERE user_id = NEW.id AND name_key = 'envelopeIncome';

  -- ── Income ─────────────────────────────────────────────────────────────────
  INSERT INTO public.finance_categories
    (user_id, name, name_key, icon, color, keyword_rules, envelope_id)
  VALUES
    (NEW.id, 'Salário',       'categorySalary',   '💼', '#3b82f6', '[]', v_env_inc),
    (NEW.id, 'Transferência', 'categoryTransfer', '↔️', '#6B7280', '[]', v_env_inc);

  -- ── Gastos Essenciais ──────────────────────────────────────────────────────
  INSERT INTO public.finance_categories
    (user_id, name, name_key, icon, color, keyword_rules, envelope_id)
  VALUES
    (NEW.id, 'Moradia',    'categoryHousing',   '🏠', '#3b82f6',
     '["loyer","aluguel","charges","energie","electricite","internet","box","faxina"]', v_env_ess),
    (NEW.id, 'Mercado',    'categoryGroceries', '🛒', '#3b82f6',
     '["carrefour","monoprix","franprix","lidl","aldi","casino","supermarche","supermercado","mercado"]', v_env_ess),
    (NEW.id, 'Saúde',      'categoryHealth',    '💊', '#3b82f6',
     '["pharmacie","farmacia","medecin","hopital","mutuelle","docteur","sante"]', v_env_ess),
    (NEW.id, 'Transporte', 'categoryTransport', '🚇', '#3b82f6',
     '["navigo","ratp","sncf","metro","transporte","uber","taxi","blablacar"]', v_env_ess),
    (NEW.id, 'Celular',    'categoryPhone',     '📱', '#3b82f6',
     '["free mobile","sfr","orange","bouygues","celular","telephone","forfait"]', v_env_ess);

  -- ── Investimentos (só uma categoria) ──────────────────────────────────────
  INSERT INTO public.finance_categories
    (user_id, name, name_key, icon, color, keyword_rules, envelope_id)
  VALUES
    (NEW.id, 'Investimentos', 'categoryInvestment', '📈', '#10b981',
     '["interactive brokers","bourse direct","trade republic","degiro","xp invest","clear","btg","avenue","trading 212","investimento","corretora"]', v_env_inv);

  -- ── Gastos Não Essenciais ──────────────────────────────────────────────────
  INSERT INTO public.finance_categories
    (user_id, name, name_key, icon, color, keyword_rules, envelope_id)
  VALUES
    (NEW.id, 'Streaming',         'categoryStreaming',    '🎬', '#ec4899',
     '["netflix","youtube","disney","spotify","deezer","apple tv","canal+","streaming"]', v_env_non),
    (NEW.id, 'Compras',           'categoryShopping',    '🛍️', '#ec4899',
     '["amazon","fnac","zara","h&m","primark","uniqlo","asos","vinted","leboncoin","compras","shopping"]', v_env_non),
    (NEW.id, 'Cuidados Pessoais', 'categoryPersonalCare','💆', '#ec4899',
     '["coiffeur","salon","esthetique","spa","parfum","sephora","cuidados","corte de cabelo"]', v_env_non),
    (NEW.id, 'Presentes',         'categoryGifts',       '🎁', '#ec4899',
     '["cadeau","presente","anniversaire","noel","fleurs"]', v_env_non),
    (NEW.id, 'Educação',          'categoryEducation',   '📚', '#ec4899',
     '["udemy","coursera","livres","livre","formation","cours","educacao","escola"]', v_env_non);

  -- ── Torrar ─────────────────────────────────────────────────────────────────
  INSERT INTO public.finance_categories
    (user_id, name, name_key, icon, color, keyword_rules, envelope_id)
  VALUES
    (NEW.id, 'Bares e Restaurantes', 'categoryBarsRestaurants', '🍽️', '#a855f7',
     '["restaurant","brasserie","bistrot","bar","cafe","deliveroo","ubereats","just eat","rappi","ifood"]', v_env_tor),
    (NEW.id, 'Balada',               'categoryShowsParties',    '🎶', '#a855f7',
     '["club","boite","concert","show","festival","billeterie","fnac spectacles"]', v_env_tor),
    (NEW.id, 'Viagem',               'categoryTravel',          '✈️', '#a855f7',
     '["airfrance","easyjet","ryanair","airbnb","booking","hotels","voyage","viagem","smiles","latam","gol"]', v_env_tor),
    (NEW.id, 'Lazer',                'categoryEntertainment',   '🎭', '#a855f7',
     '["cinema","theatre","musee","parc","loisir","lazer","piscine","sport","salle de sport","academia"]', v_env_tor);

  RETURN NEW;
END;
$$;

-- ── Correções no perfil do André ──────────────────────────────────────────────
-- Renomear "Exterior" → "Ações no Exterior" e garantir name_key correto
UPDATE asset_classes
SET name = 'Ações no Exterior', name_key = 'classAcoesExterior'
WHERE user_id = '453bc770-0cea-4c88-b72f-babf9e50437e'
  AND LOWER(name) IN ('exterior', 'ações exterior', 'acoes exterior');

-- Garantir que Imóveis (antigo FIIs) usa classImoveis
UPDATE asset_classes
SET name_key = 'classImoveis'
WHERE user_id = '453bc770-0cea-4c88-b72f-babf9e50437e'
  AND LOWER(name) IN ('imóveis', 'imoveis')
  AND (name_key IS NULL OR name_key = 'classFiis');

-- ── Backfill name_key para classes sem ele (usuários anteriores à 023) ────────
UPDATE asset_classes SET name_key = 'classAcoesBrasil'
  WHERE name_key IS NULL AND LOWER(name) IN ('ações brasil','acoes brasil','brazilian stocks');
UPDATE asset_classes SET name_key = 'classAcoesExterior'
  WHERE name_key IS NULL AND LOWER(name) IN ('ações no exterior','acoes no exterior','ações exterior','acoes exterior','international stocks','exterior');
UPDATE asset_classes SET name_key = 'classImoveis'
  WHERE name_key IS NULL AND LOWER(name) IN ('imóveis','imoveis','fiis','fii','real estate','immobilier');
UPDATE asset_classes SET name_key = 'classCripto'
  WHERE name_key IS NULL AND LOWER(name) IN ('cripto','crypto');
UPDATE asset_classes SET name_key = 'classRendaFixa'
  WHERE name_key IS NULL AND LOWER(name) IN ('renda fixa','fixed income','revenus fixes');
UPDATE asset_classes SET name_key = 'classPrevidencia'
  WHERE name_key IS NULL AND LOWER(name) IN ('previdência','previdencia','pension','prévoyance');
UPDATE asset_classes SET name_key = 'classCaixa'
  WHERE name_key IS NULL AND LOWER(name) IN ('caixa','cash','liquidités','liquide');
