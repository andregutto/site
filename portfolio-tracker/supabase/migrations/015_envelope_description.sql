-- Add description field to finance_envelopes so users can explain what each envelope is for
ALTER TABLE finance_envelopes ADD COLUMN IF NOT EXISTS description TEXT;
