-- 061: "Momento 1:1" implícito — criado automaticamente na primeira despesa
-- dividida direto de Transações com um amigo, sem exigir que o usuário crie
-- um Momento antes. Fica oculto da listagem (GET /moments) e só aparece como
-- saldo na página Pessoas. Se um 3º participante for adicionado depois, o
-- momento é "promovido" (is_pair_default=false + nome real) e passa a se
-- comportar como um Momento normal (grupo).
ALTER TABLE finance_moments ADD COLUMN is_pair_default BOOLEAN NOT NULL DEFAULT false;
