# Modelo de despesas compartilhadas: Momento vs. Categoria/Grupo

Existem hoje (e depois desta mudança) **três** mecanismos de "despesa entre pessoas"
no Arvo. Eles se parecem à primeira vista mas resolvem problemas diferentes — este
documento existe pra não perder de vista essa distinção da próxima vez que alguém
(humano ou IA) mexer nessa área.

## 1. Momento (`finance_moments`)

- **Foco: o evento.** Viagem, festa, jantar, "churrasco de sábado".
- Sempre visível na lista de Momentos, sempre tem nome/ícone/capa/colaboradores.
- **Sempre gera saldo devedor** — quem pagou é reembolsado pelos outros
  participantes (`finance_moment_expenses` + `finance_moment_expense_shares`).
- Acesso via convite/aceite (ou membro ativo direto, se veio do momento 1:1 oculto —
  ver abaixo).

## 2. Categoria compartilhada / Grupo (`shared_groups`, `shared_categories`)

- **Foco: o orçamento recorrente.** Aluguel, mercado, streaming da família — coisas
  que entram no Planejamento mês a mês.
- Vive dentro de um Envelope no Planejamento (`FinancesBudgetPage.tsx`), com "minha
  meta" (`my_goal`) alinhada às categorias normais e a meta do grupo como referência
  secundária.
- **NUNCA gera saldo devedor.** Cada membro paga sua parte separadamente; a % de
  divisão (`share_pct`, opcionalmente `share_mode: 'salary_based'`) é só uma
  referência de quanto cada um *deveria* gastar, não um empréstimo a ser acertado.
  Isso é proposital — decisão tomada em 2026-07-03 pra não duplicar a semântica de
  saldo do Momento dentro de algo que é conceitualmente "meta", não "dívida".
- Editar a divisão (`SplitModal` em `FinancesBudgetPage.tsx`) afeta **todas** as
  categorias daquele grupo, não só a que foi clicada — o modal avisa isso
  explicitamente (`editSplitScopeWarning`).
- Criar/editar o grupo em si (nome, convite/remoção de membros) ainda só existe em
  `SharedCategoriesPage.tsx` (`/finances/shared`) — candidato a mover pra dentro da
  página Amigos, já que é fundamentalmente "gestão de quem está no meu círculo", não
  "gestão de categoria".

## 3. Momento oculto "pair-default" / "group-default" (`finance_moments.is_pair_default`)

- **Foco: despesas avulsas com pessoas específicas, sem virar evento nem categoria.**
  É o modo "Splitwise puro" — pra quem só quer dividir uma conta pontual com um
  amigo ou com um grupo recorrente de pessoas, sem precisar nomear uma viagem nem
  criar uma categoria de orçamento.
- Criado sob demanda (`POST /finances/moments/default-with/:friendUserId`), nunca
  aparece na lista de Momentos (`GET /moments` filtra `is_pair_default`), nunca
  aparece como "contexto" de relação na página Amigos (`people.ts` filtra do mesmo
  jeito) — só aparece como saldo (com lista de despesas via `ExpensesPanel` num
  modal, sem a moldura de Momento).
- Membro é adicionado como **ativo direto**, sem convite/aceite — desvio deliberado
  do checklist de "shared feature" do `CLAUDE.md`, justificado porque esse momento
  nunca é uma superfície de colaboração nova: só formaliza uma conexão de amizade
  que já existe e já foi aceita.
- Tem um endpoint de "promoção" (`POST /moments/:id/promote`) pra virar um Momento
  visível de verdade se um 3º participante precisar entrar — ainda sem gatilho de
  UI, porque os dois entry points atuais (Pessoas, Transações) só permitem os
  membros já existentes.
- **Extensão planejada (2026-07-03, ainda não implementada):** generalizar esse
  mecanismo de par (2 pessoas) para grupo (N pessoas, os membros de um
  `shared_groups`), permitindo dividir uma despesa avulsa com "a galera do grupo X"
  sem precisar que essa despesa vire uma categoria recorrente do Planejamento. Isso
  também precisa de uma seção "Saldo do grupo" separada visualmente da lista de
  categorias (que continua sendo só referência), pra não reintroduzir a confusão
  entre "meta" e "dívida" que motivou a decisão do item 2.

## Resumo rápido (quando usar o quê)

| Situação | Mecanismo |
|---|---|
| Viagem, festa, evento pontual com nome | Momento visível |
| Aluguel, mercado, assinatura — recorrente, entra no orçamento | Categoria compartilhada (Grupo) |
| Uma conta avulsa com um amigo, sem criar nada | Momento oculto 1:1 |
| Uma conta avulsa com a galera de um grupo já existente, sem virar categoria | Momento oculto do grupo (planejado) |
