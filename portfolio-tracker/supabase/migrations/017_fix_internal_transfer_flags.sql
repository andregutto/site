-- Fix transactions incorrectly flagged as internal transfers.
-- "Paiement envoyé par X" means "payment sent BY X (to me)" = income, not a P2P transfer.
-- The CSV parser was matching both "envoyé à" (outgoing P2P) and "envoyé par" (incoming).
-- This resets the flag for all such rows so a re-import will reclassify them correctly.
UPDATE finance_transactions
SET is_internal_transfer = false
WHERE is_internal_transfer = true
  AND description ~* '^paiement\s+envoy[eé]\s+par\s+';
