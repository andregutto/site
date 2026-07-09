# TIERS_PLAN — Estratégia de tiers do Arvo

Fechada em 2026-07-09, antes do 1º vídeo do YouTube. Registro canônico da matriz
Free/Plus/Pro/Beta, do racional e das decisões de implementação. Evoluções da
matriz devem ser registradas no histórico no fim deste arquivo.

## Enquadramento

O Arvo é a **comunidade fechada** do André, não um app gratuito — sem ads, sem
free generoso (referências: Finary Gratuit e conta grátis da Epic, que são
quase vazios). O free existe pra alimentar o funil (lead magnets dos vídeos) e
os loops virais, não pra ser um plano de uso.

**Sem checkout no lançamento.** Os gates entram no ar desde o dia 1 mostrando o
modelo; tiers são atribuídos manualmente pelo admin. O modal de upgrade diz que
os upgrades "abrem em breve" e oferece **"Avisar quando abrir"** — cada clique
grava interesse (1 por usuário+gate em `upgrade_interest`), vira métrica no
admin e validação de demanda por funcionalidade antes de definir preço.

**Linguagem: sempre "upgrade", nunca "vire membro"** — quem está no free já é
membro da comunidade Arvo. Preços não são anunciados (ancoragem interna
discutida: Plus €39–49/ano, Pro €99–129/ano — de propósito abaixo do degrau
equivalente do Finary, que tem open banking e o Arvo não; compensamos com
comunidade + viagens + divisão de despesas).

## Princípio

- **Free = fazer na mão + participar.** Registro manual ilimitado; participação
  completa em tudo que outro usuário criou. **Quem divide nunca é bloqueado**
  (splits são o motor viral): quem hospeda/cria paga, quem participa não.
- **Plus = automatizar e conviver.** Import, IA, comunidade, mensagens, criar
  estruturas compartilhadas, Patrimônio.
- **Pro = analisar profissionalmente.** Insights, Diversification, IR França,
  limites maiores.
- **Beta = interno/testers.** Topo do ranking, atribuição manual, **nunca**
  aparece como oferta em nenhuma superfície de usuário.

Ranking: `free(0) < plus(1) < pro(2) < beta(3)`.

## Matriz (defaults — fonte executável em `shared-api/src/lib/entitlements.ts`)

| | Free | Plus | Pro |
|---|---|---|---|
| Participar: convites, splits, links gated de viagem, categorias compartilhadas alheias | ✓ | ✓ | ✓ |
| Splits 1:1 e em grupo (momentos ocultos `is_pair_default`) | ✓ ilimitado | ✓ | ✓ |
| Promoção de split → momento nomeado (3ª pessoa; pede só o nome) | ✓ sempre, não conta cota | ✓ | ✓ |
| Transações/contas/categorias manuais | ✓ ilimitado | ✓ | ✓ |
| Despesas de divisão criadas/dia (`split_expenses_per_day`) | 5 | ilimitado | ilimitado |
| Viagens próprias (`trips_own`) | 1 | ilimitado | ilimitado |
| Criar Momento nomeado do zero (`moments_create`) | — | ✓ | ✓ |
| Planos de liberdade (`freedom_plans`) | — | ✓ | ✓ |
| Orçamento/envelopes (`budget`) | — | ✓ | ✓ |
| Criar grupos/categorias compartilhadas (`shared_groups_create`) | — | ✓ | ✓ |
| Comunidade inteira, leitura inclusive (`community`; pill visível, gate no conteúdo) | — | ✓ | ✓ |
| Mensagens (`messaging`) | — | ✓ | ✓ |
| Patrimônio inteiro (`patrimonio`; contas/instituições ficam fora) | — | ✓ | ✓ |
| Import CSV (`csv_import`) / contas com import (`import_accounts`) | — | 3 contas | ilimitado |
| Categorização IA (`ai_categorize_month`) | — | 100/mês | 1.000/mês |
| Insights (`insights`) | — | — | ✓ |
| Diversification (`diversification`) | — | — | ✓ |
| IR França 2DC/2TR (`ir_france`) | — | — | ✓ |
| Recursos | free | +plus | +pro |

IA nunca é ilimitada em tier vendável (custo real por chamada); Beta é
ilimitado em tudo.

## Racional das decisões não-óbvias

- **Patrimônio inteiro no Plus** (não degustação de N ativos): gate de rota
  simples, coerente com "free mínimo", e reversível barato — liberar depois é
  presente, retirar depois é crise. Essa assimetria justifica começar restrito.
  Condição estrutural: contas/instituições são compartilhadas com Finanças,
  então **ficam fora do gate** e ganham link no subnav de Finanças.
- **Não gatear vertente inteira de Finanças/Voyage**: Momento é o backbone
  (viagem lê custo de `finance_moments`; splits idem). Gate é por capacidade,
  não por vertente.
- **Divisão 3+ = Momento NOVO do zero (modelo B, 2026-07-10)**: promover o
  par oculto foi implementado e depois substituído — levava o histórico 1:1
  junto e a pessoa nova VIA as despesas antigas do par (privacidade + modelo
  mental confuso, apontado pelo André no teste real). Fluxo atual: botão
  "Dividir com mais pessoas" no 1:1 cria um Momento novo e vazio via
  `POST /finances/moments/split-group` (sem gate; guard = ser membro de um par
  oculto real) e convida os participantes nele, aceite explícito inclusive pro
  amigo do 1:1. O 1:1 fica intocado e privado. Naming: verbo no botão, nunca
  "momento em grupo" (colidiria com Grupo de Pessoas). `/promote` fica
  dormente no backend.
- **5 despesas de divisão/dia no free**: é o que o Splitwise faz (~4/dia) e o
  produto deles provou tolerância. Conta despesas *criadas* pelo usuário;
  participar/acertar não conta.
- **Sem painel de edição livre + com overrides**: defaults versionados em
  código (`entitlements.ts`); admin edita via `entitlement_overrides` (por
  linha, com "restaurar padrão"), merge com cache de 60s. Histórico fica no
  git (defaults) e em `updated_at` (overrides).

## Implementação

- **Migração 080**: tier `pro` nos CHECKs (`community_members.tier`,
  `resources.visibility`), tabelas `entitlement_overrides`, `entitlement_usage`
  (+ função `increment_entitlement_usage`), `upgrade_interest`.
- **Contrato de erro**: endpoints gated respondem 403 com
  `{ error: 'upgrade_required', gate, required_tier, limit?, used? }`. O
  frontend intercepta e abre o UpgradeModal. (Substitui o antigo
  `premium_required` de mensagens.)
- **UpgradeModal**: estilo Finary — tabela 3 colunas (Free/Plus/Pro, sem Beta,
  sem preços), linha do gate disparador em destaque, arte autoral no topo,
  CTA "Avisar quando abrir" (`POST /entitlements/interest`). Página `/planos`
  renderiza a mesma tabela da mesma fonte (`GET /entitlements`).
- **Admin**: visão da matriz efetiva (defaults + overrides, incluindo cotas e
  Beta), edição por linha com restaurar padrão, e métricas de interesse
  (total por gate, por tier, curva no tempo).
- Mensagens: gate antigo por env `MESSAGING_TIER_REQUIRED` substituído pelo
  gate `messaging` de entitlements.

## Pendências conhecidas

- **Trial de 7 dias** quando a cobrança abrir (padrão Finary), em vez de free
  trial permanente.
- **Preview borrado (padrão Finary) nos bloqueios**: primeira tentativa
  (2026-07-09) foi vetada ("muito feio, não dá pra ver nada") — a foto autoral
  continua sendo o aprovado. Evolução possível: bloqueio em formato mais
  "modal", com o conteúdo borrado visível nas LATERAIS/fundo da página em vez
  de escondido atrás do card. Componente `GatedPreviewMock.tsx` ficou no repo,
  dormente, pra essa evolução.

- **UI da promoção de split** (adicionar 3ª pessoa num split 1:1 → pedir nome →
  promote + convite): não existia antes dos tiers e ficou fora deste lote.
  Sem ela, free não consegue iniciar split 3+ fora de grupo — aceitável por
  ora, priorizar em seguida.
- Checkout/pagamento: só quando houver demanda registrada (upgrade_interest).
- **Modelo de assinatura + KPIs (junto do checkout)**: tabela `subscriptions`
  (user_id, plano, status, started_at, expires_at/renews_at, valor, moeda) +
  `subscription_payments` (histórico de cobranças). A aba Usuários do admin
  ganha as colunas: assinou quando, plano, expira quando, total pago (LTV por
  usuário). Painel de KPIs: MRR, churn, conversão free→pago, LTV médio,
  receita por origem (signup_source, fechando o funil dos vídeos).
- **Bloqueio de usuário** (aba Usuários): ban nativo do Supabase Auth +
  mensagem amigável no login + corte de sessão viva no requireAuth.
- Kit: exportar interessados como segmento quando o checkout abrir.

## Histórico

- **2026-07-09** — Estratégia inicial fechada e implementada (matriz acima).
- **2026-07-09 (b)** — `community_post` (só postar) absorvido por `community`
  (vertente inteira, leitura inclusive): André reafirmou que comunidade fechada
  = conteúdo exclusivo de membro pagante, não só escrita. Exceções no router:
  `/is-admin` e `/users/*` (perfil serve superfícies compartilhadas).
