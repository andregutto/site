-- Seed: Valores manuais iniciais (NATIXIS e REVOLUT)
-- Usuário atualiza mensalmente via interface

DO $$
DECLARE
  uid UUID := (SELECT id FROM auth.users LIMIT 1);
  aid INTEGER;
BEGIN
  -- REVOLUT: saldo em EUR (usuário atualiza mensalmente)
  -- Valor inicial omitido — usuário cadastra ao abrir o app

  -- NATIXIS: previdência privada em EUR
  -- Valor inicial omitido — usuário cadastra ao abrir o app

  -- Apenas demonstração de como inserir:
  -- SELECT id INTO aid FROM assets WHERE user_id=uid AND code='REVOLUT';
  -- INSERT INTO manual_values (asset_id, ref_date, value, currency, notes)
  --   VALUES (aid, '2025-01-01', 15000.00, 'EUR', 'Saldo inicial Revolut')
  -- ON CONFLICT (asset_id, ref_date) DO NOTHING;

  RAISE NOTICE 'Manual values seed: aguardando input do usuário via interface.';
END $$;
