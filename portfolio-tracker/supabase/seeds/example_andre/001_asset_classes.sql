-- Seed: Classes de ativos do portfólio do André
-- Execute APÓS criar o usuário via Supabase Auth
-- Substitua USER_ID pelo UUID do usuário criado

DO $$
DECLARE
  uid UUID := (SELECT id FROM auth.users LIMIT 1); -- ajustar para UUID real
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
