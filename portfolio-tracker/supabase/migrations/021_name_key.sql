-- Add name_key column to support i18n for default envelopes and categories
ALTER TABLE finance_envelopes  ADD COLUMN IF NOT EXISTS name_key TEXT;
ALTER TABLE finance_categories ADD COLUMN IF NOT EXISTS name_key TEXT;

-- Backfill André's standard envelopes (type-based defaults only — custom names left NULL)
UPDATE finance_envelopes SET name_key = 'envelopeEssential'  WHERE id = 1;
UPDATE finance_envelopes SET name_key = 'envelopeInvestment' WHERE id = 2;
UPDATE finance_envelopes SET name_key = 'envelopeIncome'     WHERE id = 5;

-- Backfill standard income categories
UPDATE finance_categories SET name_key = 'categoryTransfer' WHERE name IN ('Transferência', 'Transfer', 'Virement');
UPDATE finance_categories SET name_key = 'categorySalary'   WHERE name IN ('Salário', 'Salary', 'Salaire');
