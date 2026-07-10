-- O índice único em (user_id, source) existe pra deduplicar IMPORTS (chaves
-- csv:<hash> / TrueLayer). 'manual' não é chave de dedupe, é marcador de
-- procedência — mas como toda transação manual grava source='manual', o índice
-- passou a permitir só UMA transação manual por usuário (duplicate key na
-- segunda). Recria excluindo 'manual' da unicidade.
DROP INDEX IF EXISTS idx_finance_transactions_source;
CREATE UNIQUE INDEX idx_finance_transactions_source
  ON finance_transactions(user_id, source)
  WHERE source IS NOT NULL AND source <> 'manual';
