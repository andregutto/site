-- 059: "Acertar contas" — marca lançamentos de finance_moment_expenses que são
-- pagamentos de quitação (não despesas reais), pra zerar o saldo em CADA Momento
-- onde havia pendência com aquele amigo (não só o agregado da tela Pessoas).
-- settlement_batch_id agrupa as N linhas (uma por Momento/moeda pendente) criadas
-- num único clique de "Acertar contas", pra virar UMA notificação só pro amigo.

ALTER TABLE finance_moment_expenses
  ADD COLUMN is_settlement BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN settlement_batch_id UUID;

CREATE INDEX idx_fme_settlement_batch ON finance_moment_expenses(settlement_batch_id) WHERE settlement_batch_id IS NOT NULL;
