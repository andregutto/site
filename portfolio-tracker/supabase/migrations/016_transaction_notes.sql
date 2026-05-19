-- Add notes column to finance_transactions (used for inline annotations per transaction)
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
