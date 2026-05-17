-- ============================================================
-- Migration 008: Rename envelopes + redistribute categories
-- New 50/30/10/10 names: Gastos Essenciais / Investimentos /
--   Gastos Não Essenciais / Torrar
-- Run manually in Supabase SQL Editor for André's existing data
-- ============================================================

DO $$
DECLARE
  uid       UUID := '453bc770-0cea-4c88-b72f-babf9e50437e';
  env_ness  INT;  -- Gastos Não Essenciais (ex-Reserva)
  env_inv   INT;  -- Investimentos (ex-Futuro)
  env_torrar INT; -- Torrar (ex-Livre)
BEGIN

-- ── Rename envelopes ─────────────────────────────────────────
UPDATE finance_envelopes
SET name = 'Gastos Essenciais'
WHERE name = 'Essenciais' AND user_id = uid;

UPDATE finance_envelopes
SET name = 'Investimentos'
WHERE name = 'Futuro' AND user_id = uid;

-- Reserva becomes Gastos Não Essenciais (type: free, new color)
UPDATE finance_envelopes
SET name = 'Gastos Não Essenciais', type = 'free', color = '#EC4899', icon = '🎯'
WHERE name = 'Reserva' AND user_id = uid;

-- Livre becomes Torrar
UPDATE finance_envelopes
SET name = 'Torrar', color = '#A855F7', icon = '🎉'
WHERE name = 'Livre' AND user_id = uid;

-- ── Resolve envelope IDs ──────────────────────────────────────
SELECT id INTO env_ness   FROM finance_envelopes WHERE name = 'Gastos Não Essenciais' AND user_id = uid;
SELECT id INTO env_inv    FROM finance_envelopes WHERE name = 'Investimentos'          AND user_id = uid;
SELECT id INTO env_torrar FROM finance_envelopes WHERE name = 'Torrar'                 AND user_id = uid;

-- ── Move Poupança → Investimentos ────────────────────────────
UPDATE finance_categories
SET envelope_id = env_inv, color = '#10B981'
WHERE name = 'Poupança' AND user_id = uid;

-- ── Move recurring/small non-essential items → Gastos Não Essenciais ─
-- (Streaming, Compras, Cuidados Pessoais, Presentes, Educação)
UPDATE finance_categories
SET envelope_id = env_ness, color = '#EC4899'
WHERE name IN ('Streaming', 'Compras', 'Cuidados Pessoais', 'Presentes', 'Educação')
  AND user_id = uid;

-- ── Torrar keeps: Bares e Restaurantes, Balada, Viagem, Lazer ─
UPDATE finance_categories
SET color = '#A855F7'
WHERE envelope_id = env_torrar AND user_id = uid;

END $$;
