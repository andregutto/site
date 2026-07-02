-- 060: liga cada finance_moment_expenses a uma finance_transactions real, pra
-- que a despesa manual conte no total gasto do Momento e apareça na lista de
-- transações normalmente — hoje elas viviam isoladas, sem afetar summary.total.
-- owns_transaction: true quando a transação foi criada JUNTO com a despesa
-- (deletar a despesa deve apagar a transação); false quando a despesa foi
-- criada a partir de uma transação PRÉ-EXISTENTE (deletar a despesa deve
-- manter a transação intacta, só remover a divisão).

ALTER TABLE finance_moment_expenses
  ADD COLUMN transaction_id BIGINT REFERENCES finance_transactions(id) ON DELETE CASCADE,
  ADD COLUMN owns_transaction BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX idx_fme_transaction ON finance_moment_expenses(transaction_id);
