-- Fix transactions wrongly classified as internal transfers.
-- "Paiement reçu de", "Reçu de", "Virement de", "Recebido de", "TED de"
-- are all RECEIVED money (income) and should never be internal transfers.
UPDATE finance_transactions
SET is_internal_transfer = false
WHERE is_internal_transfer = true
  AND description ~* '^(paiement\s+re[cç]u|re[cç]u\s+de|virement\s+de|recebido\s+de|ted\s+de)\s+';
