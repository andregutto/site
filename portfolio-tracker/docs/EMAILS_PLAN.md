# EMAILS_PLAN — Sistema de emails do Arvo

Plano aprovado com o André em 2026-07-12. Template master aprovado em
`docs/email-template-master.html` (lockup no canto inferior esquerdo da faixa
de foto, gradiente só na base, blocos variáveis). Segue `DESIGN_SYSTEM.md`.

## Arquitetura

- **Resend** envia tudo (transacional + broadcasts). Domínio `arvo.andregutto.com`
  (subdomínio de envio a definir na configuração, ex. `mail.arvo.andregutto.com`).
- **Supabase Auth** (confirmação/reset) passa a sair pelo SMTP do Resend com os
  templates novos de `supabase/email-templates/`.
- **Kit: APOSENTADO** (decisão do André, 2026-07-12). Sem envio transacional;
  sequências e broadcasts cobertos pelo Resend + cron próprio. Na Fase 5,
  `newsletter.ts` migra a inscrição pra Supabase + Resend Audience e o Kit é
  cancelado. Até lá continua inscrevendo no Kit (não quebra nada).
- Templates transacionais vivem no código: 1 layout master + "recheios" finos
  por tipo (Fase 3), em `shared-api/src/lib/email/`. Tags por categoria no
  Resend pra métricas.
- Supressão: evento visto no app não vira email (janela por tipo).
- Trilíngue pt/en/fr via `preferred_locale`, como os templates do Auth.

## Tabela de emails

### Conta (obrigatórios, sem opt-out)
| # | Email | Gatilho | Status |
|---|---|---|---|
| 1 | Confirmação de cadastro | signup | template novo pronto |
| 2 | Reset de senha | pedido | template novo pronto |
| 10 | Upgrade de tier confirmado | mudança `community_members.tier` (gatilho novo) | fase 3 |

### Tempo real (com supressão in-app)
| # | Email | Gatilho | Preferência |
|---|---|---|---|
| 3 | Convite de grupo/momento/viagem | `*_invite` | Convites e social |
| 4 | Convite/aceite de amizade | `friend_*` | Convites e social |
| 5 | Adicionado a grupo/momento/viagem | `*_added` | Convites e social |
| 6 | Resposta na sua conversa | `community_reply` | Comunidade |
| 7 | Mensagem direta não lida (~15 min) | messaging (evento novo) | Mensagens |
| 8 | Acerto de contas recebido | `settlement_received` | Despesas compartilhadas |
| 9 | Grupo/momento excluído com saldo | `*_deleted_with_balance` | Despesas compartilhadas |
| 11 | Erro na conexão bancária | `bank_connect_error` | Alertas da conta |

### Digests (frequência escolhível pelo usuário: diário/semanal)
| # | Email | Junta | Padrão |
|---|---|---|---|
| 12 | Resumo de despesas compartilhadas | `expense_share_added` | diário, se houver |
| 13 | Resumo de alertas financeiros | `budget_alert`, `overbudget_streak`, `negative_balance`, `subscription_detected`, `stale_manual_asset`, `split_warning` | semanal |

### Mensal
| # | Email | Conteúdo | Quando |
|---|---|---|---|
| 13b | **Seu mês no Arvo** (um email, blocos condicionais) | Patrimônio (total, delta, top movimentos) + Finanças (gasto vs. planejado) + Entre amigos (saldos pendentes na virada) | no `month_cycle_day` do usuário |

### Ciclo de vida (Resend broadcasts/cron; ex-Kit)
| # | Email | Gatilho |
|---|---|---|
| 14 | Sequência de boas-vindas (2-3 emails) | cadastro confirmado (cron por idade da conta) |
| 15 | Recurso baixado + follow-up | `signup_source=resource:*` |
| 16 | "Abriu o que você pediu" | lançamento de gate (lista `upgrade_interest`) |
| 17 | Novidades / newsletter | manual (broadcast) |
| 18 | Reativação | 30d sem login |

**Fora de propósito**: reação/novo post da comunidade, `bank_connected`,
`achievement` (ficam só in-app).

## Preferências (perfil > aba Preferências > seção "Emails")

Tabela nova `email_preferences` (não `user_metadata`: o dispatcher e o
unsubscribe sem login leem direto). Categorias com toggle, todas ligadas por
padrão: Convites e social, Comunidade, Mensagens, Despesas compartilhadas
(+ freq diário/semanal), Resumo de alertas (+ freq), Fechamento mensal,
Novidades. Todo email leva "Ajustar preferências" + unsubscribe de 1 clique
por categoria via token.

## Identidade de tier nos emails (decisão 2026-07-12)

Lockup neutro (offwhite) por padrão. Lockup com identidade do tier (glifo com
degradê do `tierMeta.ts` + nome do plano, padrão variante C do header) só em:
**upgrade confirmado (#10)** e **Seu mês no Arvo (#13b)**. Gerar PNGs dos
glifos Plus/Pro pra fundo escuro na Fase 4.

## Fases

1. **Fundação** ← em andamento: templates Auth novos (prontos), asset
   `arvo-symbol-email.png` (pronto), verificação de domínio no Resend + DNS,
   SMTP custom no Supabase Auth, colar templates no dashboard do Supabase.
2. Preferências: tabela + UI no perfil + endpoint unsubscribe por token.
3. Transacionais tempo real (3-11) + upgrade confirmado, em
   `shared-api/src/lib/email/` (aplicar nos 3 lugares da route-duplication trap
   quando tocar rotas).
4. Digests (12, 13) + Fechamento mensal (13b) via cron.
5. Ciclo de vida (14-18) + decisão final sobre o Kit.

## Pendências externas (André)

- Verificar domínio no Resend (registros DNS: eu passo na hora).
- `RESEND_API_KEY` nos ambientes (Vercel env + `.env` local), nunca no chat.
- Colar os 2 templates Auth no dashboard Supabase (Auth > Email Templates)
  ou eu aplico via Management API se preferir.
