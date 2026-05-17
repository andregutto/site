-- ============================================================
-- Avenue → Interactive Brokers — Histórico completo de aportes
-- Fonte: 8 extratos CSV da Avenue (Nov/2020 – Mai/2023)
-- Data de transferência ACAT: 25/03/2025
--
-- Ajustes de splits aplicados (quantidades já em pós-split):
--   GOOGL 20:1  em 18/07/2022 → compras anteriores ×20, preço ÷20
--   AMZN  20:1  em 06/06/2022 → compras anteriores ×20, preço ÷20
--   TSLA   3:1  em 25/08/2022 → compras anteriores  ×3, preço ÷3
--
-- IAU: 36 ações confirmadas na IB (72 compradas na Avenue;
--      diferença vendida em período não capturado nos CSVs).
-- BABA: posição encerrada na Avenue em Nov/2023 — adicionada
--       como ativo inativo para registro histórico.
-- ============================================================

DO $$
DECLARE
  uid UUID := (SELECT id FROM auth.users LIMIT 1);
  aid INTEGER;
BEGIN

-- ============================================================
-- 1. Remover contribuições placeholder dos ativos IB (2023-01-01)
-- ============================================================
DELETE FROM contributions
WHERE asset_id IN (
  SELECT id FROM assets
  WHERE user_id = uid
  AND code IN (
    'META','AAPL','AMZN','DIS','GOOGL','JPM','NFLX','TSM',
    'KO','V','MSFT','CRM','NKE','TSLA','MCD','JNJ',
    'IVV','IJS','VNQ','IAU','VUG','VGT','AGG'
  )
);

-- ============================================================
-- 2. BABA — ativo inativo (posição encerrada na Avenue)
-- ============================================================
INSERT INTO assets (
  user_id, code, name, asset_type, class_id,
  sector, country, currency, exchange, ticker_yahoo, active
)
SELECT
  uid, 'BABA', 'Alibaba Group ADR', 'ticker',
  (SELECT id FROM asset_classes WHERE user_id = uid AND name = 'Exterior'),
  'Tecnologia', 'China', 'USD', 'Avenue', 'BABA', false
ON CONFLICT (user_id, code) DO NOTHING;

-- ============================================================
-- 3. IVV — iShares S&P 500 ETF (sem split)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'IVV';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2020-11-17', 'buy',  3.000, 363.13, 'USD'),
  (aid, '2022-03-11', 'buy',  0.500, 429.93, 'USD'),
  (aid, '2022-05-23', 'buy',  0.900, 396.75, 'USD'),
  (aid, '2022-07-25', 'buy',  2.000, 398.22, 'USD'),
  (aid, '2023-04-06', 'buy',  1.020, 410.72, 'USD'),
  (aid, '2023-05-15', 'buy',  3.000, 413.47, 'USD'),
  (aid, '2023-05-15', 'buy',  0.490, 413.59, 'USD');
-- Total: 10.91 (10 inteiros transferidos, 0.91 liquidados via ACAT)

-- ============================================================
-- 4. VNQ — Vanguard Real Estate ETF (sem split)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'VNQ';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2020-11-17', 'buy', 12.000,  86.69, 'USD'),
  (aid, '2022-03-11', 'buy',  2.000, 105.47, 'USD'),
  (aid, '2023-04-06', 'buy',  6.090,  82.11, 'USD');
-- Total: 20.09 (20 inteiros transferidos)

-- ============================================================
-- 5. IJS — iShares SmallCap Value ETF (sem split)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'IJS';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2020-11-17', 'buy', 13.000, 75.50, 'USD'),
  (aid, '2020-11-17', 'buy',  0.700, 75.50, 'USD'),
  (aid, '2023-04-06', 'buy',  5.480, 91.25, 'USD');
-- Total: 19.18 (19 inteiros transferidos)

-- ============================================================
-- 6. AAPL — Apple (split 4:1 em Ago/2020, todos os CSVs já pós-split)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'AAPL';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2021-02-08', 'buy',  7.000, 136.06, 'USD'),
  (aid, '2021-02-08', 'buy',  0.310, 136.06, 'USD'),
  (aid, '2021-03-19', 'buy',  3.000, 120.57, 'USD'),
  (aid, '2021-03-19', 'buy',  0.100, 120.57, 'USD'),
  (aid, '2022-05-23', 'buy',  4.000, 141.80, 'USD'),
  (aid, '2023-01-12', 'buy',  3.770, 132.71, 'USD'),
  (aid, '2023-04-06', 'buy',  3.040, 164.60, 'USD'),
  (aid, '2023-05-15', 'buy',  5.830, 171.60, 'USD');
-- Total: 27.05 (27 inteiros transferidos)

-- ============================================================
-- 7. META — Meta Platforms (inclui compras antigas como FB)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'META';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2021-02-08', 'buy', 2.000, 265.62, 'USD'),  -- FB
  (aid, '2021-02-08', 'buy', 1.000, 265.62, 'USD'),  -- FB
  (aid, '2021-02-08', 'buy', 0.740, 265.62, 'USD'),  -- FB
  (aid, '2022-03-11', 'buy', 2.000, 189.60, 'USD'),  -- FB
  (aid, '2022-05-23', 'buy', 4.000, 194.05, 'USD'),  -- FB → META
  (aid, '2022-07-25', 'buy', 3.000, 166.97, 'USD'),  -- META
  (aid, '2023-01-12', 'buy', 3.570, 133.16, 'USD');  -- META
-- Total: 16.31 (16 inteiros transferidos)

-- ============================================================
-- 8. GOOGL — Alphabet (split 20:1 em 18/07/2022)
--    Pré-split: qty×20, preço÷20
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'GOOGL';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2021-02-08', 'buy',  9.600, 103.77, 'USD'),  -- era 0.48 × $2075.37
  (aid, '2022-05-23', 'buy',  6.000, 111.03, 'USD'),  -- era 0.30 × $2220.69
  (aid, '2023-01-12', 'buy',  5.510,  90.72, 'USD');
-- Total: 21.11 (21 inteiros transferidos)

-- ============================================================
-- 9. AMZN — Amazon (split 20:1 em 06/06/2022)
--    Pré-split: qty×20, preço÷20
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'AMZN';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2021-02-08', 'buy', 3.400, 165.50, 'USD'),  -- era 0.17 × $3310.04
  (aid, '2021-03-25', 'buy', 3.200, 152.54, 'USD'),  -- era 0.16 × $3050.86
  (aid, '2023-01-12', 'buy', 5.270,  94.91, 'USD'),
  (aid, '2023-04-06', 'buy', 4.930, 101.51, 'USD'),
  (aid, '2023-05-15', 'buy', 4.520, 110.51, 'USD');
-- Total: 21.32 (21 inteiros transferidos)

-- ============================================================
-- 10. DIS — Walt Disney (sem split)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'DIS';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2021-02-08', 'buy',  2.000, 189.29, 'USD'),
  (aid, '2021-02-08', 'buy',  0.630, 189.29, 'USD'),
  (aid, '2021-03-19', 'buy',  2.000, 191.82, 'USD'),
  (aid, '2021-03-19', 'buy',  0.590, 191.82, 'USD'),
  (aid, '2022-03-11', 'buy',  2.000, 135.26, 'USD'),
  (aid, '2022-05-23', 'buy',  6.000, 104.63, 'USD'),
  (aid, '2022-07-25', 'buy',  5.000, 103.12, 'USD'),
  (aid, '2023-01-12', 'buy',  5.060,  98.73, 'USD'),
  (aid, '2023-04-06', 'buy',  5.000,  99.99, 'USD'),
  (aid, '2023-05-15', 'buy', 10.870,  92.00, 'USD');
-- Total: 39.15 (39 inteiros transferidos)

-- ============================================================
-- 11. CRM — Salesforce (sem split)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'CRM';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2021-02-08', 'buy', 2.000, 237.66, 'USD'),
  (aid, '2021-02-08', 'buy', 0.090, 237.66, 'USD'),
  (aid, '2021-03-25', 'buy', 2.000, 205.03, 'USD'),
  (aid, '2021-03-25', 'buy', 0.430, 205.03, 'USD');
-- Total: 4.52 (4 inteiros transferidos)

-- ============================================================
-- 12. V — Visa (sem split no período)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'V';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2021-03-25', 'buy', 4.000, 207.68, 'USD'),
  (aid, '2021-03-25', 'buy', 0.790, 207.68, 'USD');
-- Total: 4.79 (4 inteiros transferidos)

-- ============================================================
-- 13. KO — Coca-Cola (sem split no período)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'KO';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2021-03-25', 'buy', 19.000, 51.52, 'USD'),
  (aid, '2021-03-25', 'buy',  0.320, 51.52, 'USD');
-- Total: 19.32 (19 inteiros transferidos)

-- ============================================================
-- 14. TSLA — Tesla (split 3:1 em 25/08/2022)
--     Pré-split: qty×3, preço÷3
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'TSLA';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2021-03-25', 'buy', 2.370, 208.22, 'USD'),  -- era 0.79 × $624.65
  (aid, '2021-04-06', 'buy', 2.160, 231.14, 'USD');  -- era 0.72 × $693.42
-- Total: 4.53 (4 inteiros transferidos)

-- ============================================================
-- 15. JPM — JPMorgan Chase (sem split)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'JPM';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2023-01-12', 'buy', 4.000, 139.76, 'USD'),
  (aid, '2023-04-06', 'buy', 3.920, 127.70, 'USD'),
  (aid, '2023-05-15', 'buy', 3.710, 134.88, 'USD');
-- Total: 11.63 (11 inteiros transferidos)

-- ============================================================
-- 16. MCD — McDonald's (sem split)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'MCD';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2023-01-12', 'buy', 3.000, 267.66, 'USD');

-- ============================================================
-- 17. MSFT — Microsoft (sem split no período)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'MSFT';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2023-01-12', 'buy', 2.000, 234.70, 'USD'),
  (aid, '2023-01-12', 'buy', 1.000, 234.69, 'USD');

-- ============================================================
-- 18. NKE — Nike (sem split)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'NKE';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2023-01-12', 'buy', 5.000, 127.34, 'USD'),
  (aid, '2023-04-06', 'buy', 4.170, 119.84, 'USD'),
  (aid, '2023-05-15', 'buy', 4.190, 119.25, 'USD');
-- Total: 13.36 (13 inteiros transferidos)

-- ============================================================
-- 19. JNJ — Johnson & Johnson (sem split)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'JNJ';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2023-01-12', 'buy', 3.000, 173.76, 'USD');

-- ============================================================
-- 20. TSM — Taiwan Semiconductor (sem split)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'TSM';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2023-04-06', 'buy', 10.000, 90.77, 'USD');

-- ============================================================
-- 21. NFLX — Netflix (sem split no período)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'NFLX';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2022-05-23', 'buy', 3.000, 184.32, 'USD');

-- ============================================================
-- 22. IAU — iShares Gold Trust
--     36 ações confirmadas na IB. 72 foram compradas na Avenue;
--     as ~36 restantes foram vendidas em período não capturado
--     pelos 8 CSVs fornecidos. Registramos apenas a posição final.
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'IAU';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2021-03-19', 'buy', 36.000, 16.61, 'USD');

-- ============================================================
-- 23. BABA — Alibaba (compras + venda, posição zerada em Nov/2023)
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'BABA';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2021-04-06', 'buy',  1.000, 230.70, 'USD'),
  (aid, '2021-04-06', 'buy',  0.310, 230.70, 'USD'),
  (aid, '2021-04-20', 'buy',  3.000, 233.08, 'USD'),
  (aid, '2021-04-20', 'buy',  0.630, 233.08, 'USD'),
  (aid, '2023-11-27', 'sell', 4.940,  77.55, 'USD');

-- ============================================================
-- 24. Ativos sem histórico na Avenue (comprados na IB diretamente)
--     VUG, VGT: sem nenhuma compra nos CSVs → data da IB
--     AGG: sem compra nos CSVs, só aparece no ACAT → data da IB
-- ============================================================
SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'VUG';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2025-03-25', 'buy', 3.000, 391.01, 'USD');

SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'VGT';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2025-03-25', 'buy', 3.000, 601.66, 'USD');

SELECT id INTO aid FROM assets WHERE user_id = uid AND code = 'AGG';
INSERT INTO contributions (asset_id, date, type, quantity, price_orig, currency) VALUES
  (aid, '2025-03-25', 'buy', 10.000, 98.91, 'USD');

END $$;
