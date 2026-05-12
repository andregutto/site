-- Adiciona tipo 'income' (rendimentos / dividendos) em contributions
ALTER TABLE contributions DROP CONSTRAINT IF EXISTS contributions_type_check;
ALTER TABLE contributions ALTER COLUMN type TYPE VARCHAR(10);
ALTER TABLE contributions ADD CONSTRAINT contributions_type_check
  CHECK (type IN ('buy', 'sell', 'income'));
