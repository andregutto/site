# Portfolio Tracker — Progresso e Roadmap

> Atualizado a cada etapa concluída. Deploy automático via Vercel no push para `main`.
> Trabalho em etapas: concluir → deploy → próxima etapa.

---

## Legenda
- ✅ Concluído e deployado
- 🔄 Em andamento
- ⏳ Próxima etapa
- 📋 Backlog

---

## Referências rápidas

| Item | Valor |
|---|---|
| Supabase projeto | `bkgpivxpzuzedezxtknd` |
| UUID André | `453bc770-0cea-4c88-b72f-babf9e50437e` |
| Frontend dev | `http://localhost:5174` |
| Backend dev | `http://localhost:3001` |
| Credenciais | `frontend/.env` (não commitar) |

---

## Stack

- **Frontend**: Vite + React 19 + TypeScript + Tailwind CSS + Recharts
- **Backend**: Express serverless (Vercel Serverless Functions em `frontend/api/`)
- **DB**: Supabase PostgreSQL + Auth
- **Deploy**: Vercel (frontend + API no mesmo projeto)
- **APIs**: brapi.dev (B3), yahoo-finance2 (USA/ETFs), CoinGecko (cripto), BCB (CDI/IPCA), AwesomeAPI (câmbio), GoCardless (bancos europeus — fase futura), Claude Haiku (AI categorização — fase futura)

---

## Arquitetura dual-server

Toda mudança de backend deve ser feita em **dois arquivos**:
- `frontend/api/_routes/ROTA.ts` → produção (Vercel)
- `backend/src/routes/ROTA.ts` → desenvolvimento local

---

# SEÇÃO: INVESTIMENTOS

## Funcionalidades concluídas ✅

### Core
- Dashboard: patrimônio total, alocação por classe, retorno por ativo, filtro por período
- Performance histórica: Simple Dietz ajustado, gráfico mensal, YTD, 12m, 30d, desde o início, benchmarks CDI/IBOV/S&P500
- Aportes: cadastro de compras/vendas, renda fixa, imóveis, cripto, novo ativo inline
- Rebalanceamento com targets por classe
- Detalhe do ativo: P&L, gráfico histórico, tabela de aportes
- Instituições (agrupamento por banco/corretora)
- Classes de ativos com cores e CRUD
- Relatório de IR (Brasil e França): ganhos de capital, rendimentos, bens e direitos
- Índices de referência (IBOV, S&P500, etc.)
- Favoritos
- Arquivados: posições encerradas com histórico completo e P&L, botão reativar
- Conquistas: sistema de XP e níveis com 24 conquistas, verificação automática
- Onboarding guiado para novos usuários
- Suporte a 3 idiomas: PT / EN / FR
- Autenticação Supabase + perfil com foto, aniversário, país
- Seletor de moeda base: BRL / USD / EUR

### Infraestrutura
- Sync histórico: janela dinâmica baseada na data do primeiro aporte
- Reset price history: botão no Perfil reconstrói todo o histórico
- Dual-server: Vercel (produção) + Express local (desenvolvimento)
- FX rates: AwesomeAPI → fallback tabela fx_rates → fallback hardcoded (nunca trava)

---

## Pendente (Investimentos) 📋

### URGENTE — executar manualmente
- [ ] Executar `supabase/seeds/example_andre/006_avenue_history.sql` no Supabase SQL Editor
  → importa histórico completo Avenue Nov/2020–Mai/2023 com splits ajustados (GOOGL 20:1, AMZN 20:1, TSLA 3:1)
  → deleta contribuições placeholder 2023-01-01 dos 23 ativos IB
  → adiciona BABA como ativo inativo (arquivado)
- [ ] Após SQL: abrir Perfil → clicar "Rebuild history" para repopular price_history desde Nov/2020

### Features backlog
- [ ] Exportar CSV de aportes / extrato
- [ ] Modo escuro
- [ ] PWA (instalável no celular)
- [ ] Notificações de rebalanceamento quando alocação desvia do target

---

## Liberdade Financeira (tela no Portfolio) 📋

**O que é**: você define uma meta de patrimônio e prazo. O app calcula onde o patrimônio
*deveria estar* a cada mês para atingir a meta e sobrepõe com o *patrimônio real* do histórico.

- Linha real acima da planejada → adiantado ✅
- Linha real abaixo → app recalcula o aporte necessário para voltar ao trilho sem mudar o prazo

**Inputs** (configuráveis):
- Patrimônio inicial → pré-preenchido com valor atual do portfolio
- Aporte mensal → pré-preenchido com média histórica dos aportes
- Taxa de retorno mensal estimada (%)
- Horizonte em anos
- Meta de patrimônio (€/R$)

**Visualização**:
- Gráfico: linha planejada (tracejada) vs realizada (sólida, do price_history)
- Cards: Patrimônio hoje | Meta | Distância | Renda passiva projetada ao atingir meta
- Simulador: "E se eu aportar X a mais por mês?"
- Dois modos: "Dado X e Y, quanto terei?" e "Para ter Z, quanto aportar?"

**Seed André** (da aba Liberdade Financeira do Excel):
- Capital inicial: €540.000 | Aporte: €13.000/mês | Taxa: 0,6%/mês | Meta: €5.000.000 | Prazo: 20 anos
- Renda passiva ao atingir meta: €5.000.000 × 0,5% = €25.000/mês

---

# SEÇÃO: FINANÇAS (nova — a implementar)

## Conceitos-chave

| Conceito | Definição |
|---|---|
| **Envelopes** | Grupos de budget de alto nível (50/30/10/10). Ex: Essenciais, Futuro, Reserva, Livre |
| **Categorias** | Categorias granulares de despesa vinculadas a um envelope. Ex: Moradia, Netflix, Farmácia |
| **Renda mensal** | Renda líquida mensal configurada pelo usuário — base para os % dos envelopes |
| **Transações** | Despesas e receitas importadas via banco (GoCardless) ou CSV |

## Envelopes padrão (todos os novos usuários)

| Envelope | % | Tipo | Visual ao exceder/atingir |
|---|---|---|---|
| Essenciais | 50% | essencial | Barra vermelha se exceder teto |
| Futuro | 30% | investimento | Barra verde ao atingir meta ✅ |
| Reserva | 10% | poupança | Barra vermelha se exceder teto |
| Livre | 10% | livre | Barra vermelha se exceder teto |

## Categorias padrão (novos usuários — exemplos)

| Categoria | Envelope | Ícone |
|---|---|---|
| Moradia | Essenciais | 🏠 |
| Mercado | Essenciais | 🛒 |
| Saúde | Essenciais | 💊 |
| Transporte | Essenciais | 🚇 |
| Celular | Essenciais | 📱 |
| Investimentos | Futuro | 📈 |
| Poupança | Reserva | 🏦 |
| Restaurantes | Livre | 🍽️ |
| Lazer | Livre | 🎭 |
| Streaming | Livre | 🎬 |
| Viagem | Livre | ✈️ |
| Compras | Livre | 🛍️ |

## Categorias pré-populadas para André (do Excel)

| Categoria | Envelope | Valor mensal (€) |
|---|---|---|
| Aluguel + IPTU | Essenciais | 1.500 |
| Energia | Essenciais | 100 |
| Internet | Essenciais | 50 |
| Mercado | Essenciais | 150 |
| Farmácia | Essenciais | 50 |
| Celular | Essenciais | 25 |
| Transporte (Navigo) | Essenciais | 91 |
| Investimentos | Futuro | 1.000 |
| Poupança | Reserva | 0 |
| Bares e Restaurantes | Livre | 200 |
| Balada | Livre | 100 |
| Viagem | Livre | 400 |
| Compras | Livre | 100 |
| Lazer | Livre | 100 |
| Presentes | Livre | 50 |
| Streaming | Livre | 10 |
| Cuidados Pessoais | Livre | 50 |
| Educação | Livre | 100 |

Renda líquida mensal André: **€3.500** (salário bruto €70k, ~35% impostos, /13 meses)

## Corretoras detectadas para lembrete de aportes

**Brasil**: XP Investimentos, Clear, BTG Pactual, Nu Invest, Rico, Modal, Genial, Ágora, Guide,
Easynvest, Inter Invest, Órama, C6 Invest, Avenue, Toro, Itaú Corretora, Bradesco Corretora,
BB DTVM, Santander Corretora

**Europa / Internacional**: Interactive Brokers, Bourse Direct, Trading 212, Trade Republic,
Boursorama, Degiro, Saxo Bank, Scalable Capital, Fortuneo, Lynx, eToro, Swissquote,
Revolut Securities, Freestoxx

---

# ETAPAS DE IMPLEMENTAÇÃO — FINANÇAS

---

## Etapa F1 — Fundação: DB + Navegação ⏳

**Objetivo**: estrutura de banco de dados e switcher de contexto no header.

### Migrations SQL

```sql
finance_income (
  id, user_id, monthly_net NUMERIC, currency VARCHAR, updated_at
)

finance_envelopes (
  id, user_id, name VARCHAR, pct_target NUMERIC,
  color VARCHAR, type VARCHAR,  -- essential|investment|savings|free
  icon VARCHAR, sort_order INT
)

finance_categories (
  id, user_id, name VARCHAR, color VARCHAR, icon VARCHAR,
  envelope_id INT FK, budget_monthly NUMERIC,
  keyword_rules JSONB  -- ex: ["netflix","spotify"] → auto-categoriza
)

finance_bank_connections (
  id, user_id, institution_id VARCHAR, institution_name VARCHAR,
  requisition_id VARCHAR, status VARCHAR, expires_at TIMESTAMPTZ
)

finance_bank_accounts (
  id, user_id, connection_id INT FK, account_id VARCHAR,
  name VARCHAR, currency VARCHAR, balance NUMERIC,
  last_synced TIMESTAMPTZ, linked_asset_id INT FK assets
)

finance_transactions (
  id, user_id, account_id INT FK, external_id VARCHAR,
  date DATE, amount NUMERIC, currency VARCHAR,
  description VARCHAR, category_id INT FK,
  is_internal_transfer BOOLEAN, source VARCHAR,  -- gocardless|csv|manual
  raw_data JSONB
)
```

### Frontend
- Pill switcher "Investimentos / Finanças" no header (desktop + mobile)
- Layout/sub-nav da seção Finanças: Visão Geral | Transações | Budget | Contas
- Páginas stub com placeholder para cada rota

### Seeds André
- 4 envelopes com % e valores do Excel
- 18 categorias mapeadas acima com budget mensais
- Renda líquida €3.500 configurada

**Deploy**: ✅ sim ao concluir

---

## Etapa F2 — Envelopes & Categorias 📋

**Objetivo**: configuração completa do budget.

- CRUD de envelopes (nome, %, cor, tipo, ícone)
- CRUD de categorias (nome, cor, ícone, envelope pai, regras de palavra-chave, budget mensal)
- Tela de configuração de renda mensal líquida
- Tela Budget:
  - Barras por envelope: real vs meta (% da renda)
  - Expand por envelope para ver categorias filhas
  - Essenciais/Reserva/Livre: vermelho ao exceder
  - Futuro: verde ao atingir, amarelo abaixo
  - Resumo 50/30/10/10: comparativo real vs meta em %

**Deploy**: ✅ sim ao concluir

---

## Etapa F3 — Transações 📋

**Objetivo**: carregar e categorizar despesas.

- Lista de transações (data, descrição, valor, categoria, conta)
- Adição manual de transação
- Upload CSV com AI parsing:
  - Claude Haiku detecta automaticamente colunas (data, descrição, valor, tipo)
  - Suporta qualquer banco brasileiro sem parser específico
- Categorização automática via Claude Haiku:
  - Envia descrições em batch com lista de categorias do usuário
  - IA restrita às categorias existentes (nunca inventa novas)
  - Retorna sugestão por transação
- Revisão/correção manual de categorias
- Aprendizado: após correção, salva regra em `keyword_rules`
- Lembrete de corretoras: detecta transferências para corretoras conhecidas e sugere registrar aportes em Investimentos

**Deploy**: ✅ sim ao concluir

---

## Etapa F4 — GoCardless (Bancos Europeus) 📋

**Objetivo**: conexão bancária automática para bancos europeus.

- Fluxo de conexão: escolher banco → redirect GoCardless → callback → listar contas
- Tela Contas: lista contas conectadas com status, saldo e data do último sync
- Botão desconectar por conta
- Sync de saldo → atualiza `manual_values` do ativo vinculado no portfolio (Opção A)
  - Ao conectar: pergunta se quer criar ativo ou vincular a existente
- Sync de transações → importa para `finance_transactions`
- Banner de aviso quando conexão expira em < 7 dias
- Cron Vercel semanal: verifica expirações + dispara sync automático de saldo e transações

**Deploy**: ✅ sim ao concluir

---

## Etapa F5 — Visão Geral & Relatórios 📋

**Objetivo**: dashboards e histórico de despesas.

### Visão Geral (tela principal de Finanças)
- Saldo das contas conectadas
- Gastos do mês por envelope com barras 50/30/10/10
- Top categorias do mês
- Gráfico de pizza: distribuição real vs meta
- Indicador do mês: "Você está dentro do planejado / excedeu em X"

### Relatório histórico
- Gráfico de barras empilhadas por mês, cor por envelope
- Filtro por envelope, categoria e período
- Comparativo mês a mês: gasto vs budget vs mês anterior

**Deploy**: ✅ sim ao concluir

---

# ETAPAS DE IMPLEMENTAÇÃO — LIBERDADE FINANCEIRA

---

## Etapa LF1 — Tela de Liberdade Financeira (Portfolio) 📋

**Objetivo**: simulador de longo prazo com acompanhamento do plano real.

### Localização
Nova rota `/freedom` dentro da seção Investimentos (não Finanças).
Acessível pelo menu principal ou pelo dropdown do usuário.

### Funcionalidades
- Formulário de configuração (inputs):
  - Patrimônio inicial → pré-preenchido com valor atual do portfolio
  - Aporte mensal → pré-preenchido com média histórica dos aportes reais
  - Taxa de retorno mensal estimada (%)
  - Horizonte em anos
  - Meta de patrimônio (€/R$/USD, configurável)

- Gráfico de projeção vs realizado:
  - Linha planejada (tracejada) — trajetória necessária para atingir a meta
  - Linha realizada (sólida) — patrimônio real do price_history mês a mês
  - Destaque quando realizado supera o planejado

- Cards de resumo:
  - Patrimônio hoje
  - Meta
  - Distância
  - Previsão de atingir no prazo atual
  - Renda passiva mensal ao atingir meta (meta × taxa)

- Indicadores de saúde do plano:
  - "Adiantado X meses" ou "Atrasado X meses"
  - Aporte necessário para voltar ao trilho sem alterar o prazo

- Simulador de cenário:
  - Slider "E se eu aportar €X a mais por mês?"
  - Atualiza gráfico em tempo real

- Dois modos (como o Excel):
  - Modo A: "Dado capital inicial X e aporte Y, quando e quanto terei?"
  - Modo B: "Para ter Z em N anos, quanto preciso aportar por mês?"

### Seed André
- Meta: €5.000.000 | Prazo: 20 anos | Taxa: 0,6%/mês
- Aporte alvo: €13.000/mês
- Renda passiva projetada: €25.000/mês (€5M × 0,5%)

**Deploy**: ✅ sim ao concluir

---

# HISTÓRICO DE SESSÕES

## Sessão 1 — Fundação (11/05/2026) ✅
DB schema, seeds André, stack decidida, APIs externas configuradas.

## Sessão 2 — Serviços de preço + Backend (11/05/2026) ✅
brapi, Yahoo, CoinGecko, BCB, renda fixa, FX. Todos os endpoints core.

## Sessão 3 — Frontend completo (11/05/2026) ✅
Dashboard, Performance, Aportes, AppLayout, autenticação, tipos compartilhados.

## Sessão 4 — Correções críticas (11/05/2026) ✅
FX rate 429 → fallback chain. price_history vazio → sync-history endpoint.

## Sessão 5 — Ativos manuais + modais (11/05/2026) ✅
ManualValueModal, FixedIncomeSetupModal, 57/57 ativos visíveis.

## Sessão 6 — Features completas (11/05/2026) ✅
Detalhe do ativo, seletor moeda, benchmarks, ponto zero, perfil, CRUD aportes.

## Sessão 7 — Deploy Vercel (12/05/2026) ✅
Railway → Vercel Serverless. Debug de rotas, CORS, error handlers.

## Sessão 8 — Filtros de período + Fix Simple Dietz (12/05/2026) ✅
"Desde o início", "Últimos 30d". Correção da fórmula de rentabilidade.

## Sessão 9 — Formulário novo ativo + fixes (12/05/2026) ✅
Lookup de nome por ticker. Tipo de ativo no formulário. Fix carry-backward.

## Sessão 10 — Features avançadas (data posterior) ✅
Rebalanceamento, importação B3, índices, relatório IR, i18n PT/EN/FR, onboarding.

## Sessão 11 — Conquistas + histórico Avenue (17/05/2026) ✅
- 24 conquistas com XP e níveis
- Correção bugs DB (class_id, ref_date, price_history sem user_id)
- Novas conquistas: fii_investor, three_million, five_million, ten_million
- Separação FII vs imóvel físico
- Análise de 8 CSVs Avenue (Nov/2020–Abr/2025), SQL gerado aguardando execução
- Conquista Identidade: exige foto + aniversário + nome + país
- Campo birthdate adicionado ao formulário de perfil
- Arquivados: nova tela no dropdown do usuário com histórico e P&L
- Sync histórico: janela dinâmica (não mais 72 meses fixo)
- Ícone Arquivados consistente com botão na tela do ativo
