-- ============================================================
-- Seed: Finanças — André Gutto
-- Envelopes, categorias e plano de liberdade financeira
-- baseados no arquivo Estimativa despesas FR.xlsx
-- ============================================================

DO $$
DECLARE
  uid  UUID := (SELECT id FROM auth.users LIMIT 1);
  env_ess INT; env_fut INT; env_res INT; env_liv INT;
BEGIN

-- ── Renda mensal líquida ─────────────────────────────────────
INSERT INTO finance_income (user_id, monthly_net, currency)
VALUES (uid, 3500.00, 'EUR')
ON CONFLICT (user_id) DO UPDATE SET monthly_net = 3500.00, currency = 'EUR', updated_at = NOW();

-- ── Envelopes (50/30/10/10) ──────────────────────────────────
INSERT INTO finance_envelopes (user_id, name, pct_target, color, type, icon, sort_order) VALUES
  (uid, 'Essenciais', 50, '#3B82F6', 'essential',   '🏠', 1),
  (uid, 'Futuro',     30, '#10B981', 'investment',  '📈', 2),
  (uid, 'Reserva',    10, '#F59E0B', 'savings',     '🏦', 3),
  (uid, 'Livre',      10, '#8B5CF6', 'free',        '🎭', 4)
ON CONFLICT DO NOTHING;

SELECT id INTO env_ess FROM finance_envelopes WHERE user_id = uid AND name = 'Essenciais';
SELECT id INTO env_fut FROM finance_envelopes WHERE user_id = uid AND name = 'Futuro';
SELECT id INTO env_res FROM finance_envelopes WHERE user_id = uid AND name = 'Reserva';
SELECT id INTO env_liv FROM finance_envelopes WHERE user_id = uid AND name = 'Livre';

-- ── Categorias ───────────────────────────────────────────────
-- Essenciais
INSERT INTO finance_categories (user_id, envelope_id, name, color, icon, budget_monthly, keyword_rules) VALUES
  (uid, env_ess, 'Moradia',    '#3B82F6', '🏠', 1650.00, '["loyer","aluguel","charges","energie","electricite","internet","box","faxina"]'),
  (uid, env_ess, 'Mercado',    '#3B82F6', '🛒',  150.00, '["carrefour","monoprix","franprix","lidl","aldi","casino","supermarche","supermercado","mercado"]'),
  (uid, env_ess, 'Saúde',      '#3B82F6', '💊',   50.00, '["pharmacie","farmacia","medecin","hopital","mutuelle","docteur","sante"]'),
  (uid, env_ess, 'Transporte', '#3B82F6', '🚇',   91.00, '["navigo","ratp","sncf","metro","transporte","uber","taxi","blablacar"]'),
  (uid, env_ess, 'Celular',    '#3B82F6', '📱',   25.00, '["free mobile","sfr","orange","bouygues","celular","telephone","forfait"]')
ON CONFLICT DO NOTHING;

-- Futuro
INSERT INTO finance_categories (user_id, envelope_id, name, color, icon, budget_monthly, keyword_rules) VALUES
  (uid, env_fut, 'Investimentos', '#10B981', '📈', 1000.00, '["interactive brokers","bourse direct","trade republic","degiro","xp invest","clear","btg","avenue","trading 212","investimento","corretora"]')
ON CONFLICT DO NOTHING;

-- Reserva
INSERT INTO finance_categories (user_id, envelope_id, name, color, icon, budget_monthly, keyword_rules) VALUES
  (uid, env_res, 'Poupança', '#F59E0B', '🏦', NULL, '["epargne","poupanca","livret","reserva"]')
ON CONFLICT DO NOTHING;

-- Livre
INSERT INTO finance_categories (user_id, envelope_id, name, color, icon, budget_monthly, keyword_rules) VALUES
  (uid, env_liv, 'Bares e Restaurantes', '#8B5CF6', '🍽️',  200.00, '["restaurant","brasserie","bistrot","bar","cafe","deliveroo","ubereats","just eat","rappi","ifood"]'),
  (uid, env_liv, 'Balada',               '#8B5CF6', '🎶',  100.00, '["club","boite","concert","show","festival","billeterie","fnac spectacles"]'),
  (uid, env_liv, 'Viagem',               '#8B5CF6', '✈️',  400.00, '["airfrance","easyjet","ryanair","airbnb","booking","hotels","voyage","viagem","smiles","tudo azul","latam","gol"]'),
  (uid, env_liv, 'Compras',              '#8B5CF6', '🛍️',  100.00, '["amazon","fnac","zara","h&m","primark","uniqlo","asos","vinted","leboncoin","compras","shopping"]'),
  (uid, env_liv, 'Lazer',                '#8B5CF6', '🎭',  100.00, '["cinema","theatre","musee","parc","loisir","lazer","piscine","sport","salle de sport","academia"]'),
  (uid, env_liv, 'Presentes',            '#8B5CF6', '🎁',   50.00, '["cadeau","presente","anniversaire","noel","fleurs"]'),
  (uid, env_liv, 'Streaming',            '#8B5CF6', '🎬',   10.00, '["netflix","youtube","disney","spotify","deezer","apple tv","canal+","streaming"]'),
  (uid, env_liv, 'Cuidados Pessoais',    '#8B5CF6', '💆',   50.00, '["coiffeur","salon","esthetique","spa","parfum","sephora","cuidados","corte de cabelo","academia","sport"]'),
  (uid, env_liv, 'Educação',             '#8B5CF6', '📚',  100.00, '["udemy","coursera","livres","livre","formation","cours","educacao","escola"]')
ON CONFLICT DO NOTHING;

-- ── Plano de Liberdade Financeira ────────────────────────────
INSERT INTO finance_freedom_plans (
  user_id, name, is_active,
  initial_capital, monthly_contribution, monthly_return_rate, monthly_income_rate,
  target_amount, currency, horizon_years,
  notes
) VALUES (
  uid,
  'Plano Mai/2026',
  true,
  540000.00, 13000.00, 0.006, 0.005,
  5000000.00, 'EUR', 20,
  'Baseado na simulação do Excel (Liberdade Financeira). Capital inicial em Set/2022. Aporte mensal de €13k com crescimento de 0,5%/mês. Taxa de retorno estimada: 0,6%/mês (7,2% a.a.).'
)
ON CONFLICT DO NOTHING;

END $$;
