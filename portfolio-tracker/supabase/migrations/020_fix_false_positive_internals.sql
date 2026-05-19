-- Fix transactions incorrectly marked as internal transfers:
-- 1. "À la …" / "A la …" patterns (French merchant names in all-caps matched
--    the P2P regex's (à|a)\s+ prefix — restaurants/shops, not people)
-- 2. "To M <Name>" outgoing P2P payments that are real expenses
--    (e.g. regular payments to a person for rent/bills/shared costs)
UPDATE finance_transactions
SET is_internal_transfer = false
WHERE is_internal_transfer = true
  AND (
    description ~* '^([àa])\s+la\s+'       -- "À la …" / "A la …" merchant names
    OR description ~* '^([àa])\s+le\s+'    -- "À le …"
    OR description ~* '^([àa])\s+les\s+'   -- "À les …"
    OR description ~* '^([àa])\s+l'''      -- "À l'…"
  );
