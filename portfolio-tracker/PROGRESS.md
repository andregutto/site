# Portfolio Tracker — Histórico de Progresso

## Sessão 1 — Fundação (11/05/2026) ✅ CONCLUÍDA

### Decisões arquiteturais tomadas

**Escopo:** Ferramenta genérica para qualquer brasileiro no exterior — não limitada
aos 57 ativos do André. Os ativos do André são seed de exemplo.

**3 tipos de ativo:**
| Tipo | `asset_type` | Fonte de valor |
|---|---|---|
| Ações, FIIs, ETFs, Cripto | `ticker` | API externa (brapi / Yahoo / CoinGecko) |
| CDB, Tesouro, LCI, LCA | `fixed_income` | Cálculo via BCB (CDI/IPCA) |
| NATIXIS, REVOLUT | `manual` | Usuário digita valor mensal |

**Stack decidida:**
- Frontend: Vite + React 19 + TypeScript + Tailwind CSS v4 + Recharts
- Backend: Node.js + Express (TypeScript, ESM, tsx para dev)
- Banco: PostgreSQL via Supabase (projeto `bkgpivxpzuzedezxtknd`)
- Auth: Supabase Auth (email/senha)
- Deploy futuro: Vercel (frontend) + Railway/Render (backend)

**APIs externas:**
- Ações Brasil / FIIs: brapi.dev
- Ações USA / ETFs: yahoo-finance2 (npm)
- Cripto: CoinGecko
- Câmbio: AwesomeAPI (economia.awesomeapi.com.br) — via backend, não direto do browser
- Renda Fixa: BCB (api.bcb.gov.br) — série 12 (CDI diário), 433 (IPCA mensal)

**Renda Fixa — tipos e cálculo:**
- `pos_cdi`: `principal × Π(1 + CDI_dia/100 × fi_rate)` — `fi_rate` = multiplicador (1.025 = 102,5% CDI)
- `pre`: `principal × (1 + fi_rate)^(dias_úteis/252)`
- `ipca_plus`: `principal × IPCA_acum × (1 + fi_spread)^(dias_úteis/252)`
- `selic`: igual a pós-CDI mas usando série BCB 1178

---

### O que foi construído

#### Banco de dados (Supabase)
- ✅ Migration `001_initial_schema.sql` rodada com sucesso
- ✅ 9 tabelas criadas com RLS completo
- ✅ Trigger: cria `profile` automaticamente ao registrar usuário
- ✅ Seeds rodados para o usuário André (UUID: `453bc770-0cea-4c88-b72f-babf9e50437e`):
  - 6 classes de ativos com cores e targets de alocação
  - 57 ativos cadastrados (ticker / fixed_income / manual)
  - Contribuições iniciais (posição histórica de compra)

#### Frontend (`portfolio-tracker/frontend/`)
- ✅ Vite + React 19 + TypeScript + Tailwind CSS v4
- ✅ `.env` configurado (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
- ✅ `src/lib/supabase.ts` — cliente Supabase
- ✅ `src/lib/fxService.ts` — funções de câmbio via `/api/fx` (backend)
- ✅ Proxy Vite: `/api/*` → `http://localhost:3001`

#### Backend (`portfolio-tracker/backend/`)
- ✅ Express + TypeScript (ESM, tsx watch)
- ✅ CORS configurado para `http://localhost:5174`
- ✅ `src/routes/fx.ts` — 3 endpoints de câmbio via AwesomeAPI
- ✅ Cache em memória (5 min atual, 1h histórico)
- ✅ Backend rodando em `http://localhost:3001`

---

## Sessão 2 — Serviços de preço + Backend completo (11/05/2026) ✅ CONCLUÍDA

### O que foi construído

#### Backend — infraestrutura
- ✅ `src/lib/cache.ts` — cache TTL genérico usado por todos os serviços
- ✅ `src/lib/supabase.ts` — clientes admin (service_role) e user-scoped
- ✅ `src/middleware/auth.ts` — validação de JWT Supabase em cada request

#### Backend — serviços de precificação
- ✅ `src/services/brapiService.ts` — B3 via brapi.dev (cotação atual + histórico mensal)
- ✅ `src/services/yahooService.ts` — USA/globais via yahoo-finance2 (instancia com `new YahooFinance()`)
- ✅ `src/services/coingeckoService.ts` — Cripto via CoinGecko (batch getCurrentPrices)
- ✅ `src/services/bcbService.ts` — BCB séries 12 (CDI), 433 (IPCA), 1178 (Selic)
- ✅ `src/services/fixedIncomeService.ts` — calculadora: pos_cdi, pre, ipca_plus, selic
- ✅ `src/services/priceService.ts` — roteador unificado por `asset_type` + tickers disponíveis

#### Backend — rotas
- ✅ `GET /api/prices/:id/current` — preço atual de um ativo (auth obrigatório)
- ✅ `GET /api/prices/:id/history?months=24` — histórico, persiste em price_history
- ✅ `GET /api/portfolio/value` — valor consolidado (total_brl/usd/eur, by_class, by_asset)
- ✅ `GET /api/performance/summary?from=YYYY-MM&to=YYYY-MM` — Simple Dietz ajustado por aportes
- ✅ `GET /api/performance/monthly?year=YYYY` — evolução mês a mês

#### Verificações de APIs externas (curl direto)
- ✅ BCB CDI — série 12 retorna taxas diárias corretamente
- ✅ brapi.dev — PETR4 cotado em 46.25 BRL
- ✅ CoinGecko — BTC cotado em ~81.898 USD
- ✅ Yahoo Finance — META cotado em ~600.48 USD
- ✅ Auth middleware — rejeita token inválido com 401

---

## Sessão 3 — Frontend completo (11/05/2026) ✅ CONCLUÍDA

### O que foi construído

#### Frontend — autenticação
- ✅ `src/contexts/AuthContext.tsx` — AuthProvider + useAuth hook
- ✅ `src/pages/LoginPage.tsx` — login + cadastro (toggle)
- ✅ `src/lib/api.ts` — cliente HTTP com JWT injetado automaticamente

#### Frontend — Dashboard
- ✅ `src/pages/DashboardPage.tsx` — página principal com refresh
- ✅ `src/components/ValueCards.tsx` — cards BRL / USD / EUR
- ✅ `src/components/AllocationChart.tsx` — pizza + barras por classe (Recharts)
- ✅ `src/components/AssetTable.tsx` — tabela com filtro, ordenação, % por ativo

#### Frontend — Performance
- ✅ `src/pages/PerformancePage.tsx` — cards resumo + gráfico evolução + tabela mensal
- ✅ `src/hooks/usePortfolio.ts` — hooks para portfolio/value, performance/summary, performance/monthly

#### Frontend — Navegação
- ✅ `src/components/AppLayout.tsx` — header fixo + nav (desktop + mobile)
- ✅ `src/App.tsx` — BrowserRouter com rotas protegidas (ProtectedRoutes)
- ✅ `src/lib/types.ts` — tipos TypeScript compartilhados
- ✅ React Router v6 + Recharts instalados

---

## Sessão 4 — Correções de bugs críticos (11/05/2026) ✅ CONCLUÍDA

### Bugs corrigidos

#### Bug 1 + 2: FX rate (AwesomeAPI 429) → USD/EUR como `—` + apenas 24/57 ativos visíveis
Causa raiz: `getFxRate` em `portfolio.ts` usava cache key diferente de `fx.ts` (sem reaproveitamento) e ao receber 429 da AwesomeAPI lançava exceção — todos os ativos em USD/EUR eram silenciosamente descartados.

- ✅ `portfolio.ts` — `getFxRate` refatorado: usa mesma URL como cache key do `fx.ts`; fallback chain: AwesomeAPI → tabela `fx_rates` → hardcoded (USD: 5.70, EUR: 6.40)
- ✅ `portfolio.ts` — salva taxa bem-sucedida em `fx_rates` para uso futuro como fallback

#### Bug 3: Aba Performance sem dados históricos
Causa raiz: tabela `price_history` vazia — nunca populada.

- ✅ `portfolio.ts` — novo endpoint `POST /api/portfolio/sync-history`: busca 24 meses de histórico de todos os ativos `ticker` e persiste em `price_history`
- ✅ `PerformancePage.tsx` — banner âmbar com botão "Inicializar histórico" aparece quando `price_history` está vazio
- ✅ `usePortfolio.ts` — hook `useSyncHistory` para acionar o sync

---

## Sessão 5 — Ativos manuais + correções de sync (11/05/2026) ✅ CONCLUÍDA

### O que foi construído

#### Ativos manuais e renda fixa no dashboard
Todos os 57 ativos agora aparecem no dashboard — incluindo os que precisam de input do usuário.

- ✅ `portfolio.ts` — ativos `manual` sem `manual_values` e `fixed_income` com `fi_principal=NULL` retornam `needs_manual: true` em vez de serem silenciosamente ignorados
- ✅ `portfolio.ts` — TARPON (ticker de fundo sem cotação pública, sem `ticker_yahoo`/`coingecko_id`): novo guard `hasAutoSource` evita skip prematuro por `holdings=0`; cai no catch → `needs_manual: true`
- ✅ `portfolio.ts` — resposta inclui `fi_type` e `fi_start_date` nos ativos `fixed_income` para o modal pré-popular campos já cadastrados
- ✅ `frontend/src/lib/types.ts` — `PortfolioAsset` recebe `fi_type?` e `fi_start_date?`

#### Novos componentes frontend
- ✅ `ManualValueModal.tsx` — modal para TARPON/NATIXIS/REVOLUT: registra/exclui histórico em `manual_values` (data, valor, moeda, notas)
- ✅ `FixedIncomeSetupModal.tsx` — modal para CDB BTG / NTN-B: coleta `fi_principal` e `fi_start_date`; pré-popula `fi_start_date` quando já existe no banco; exibe tipo correto (IPCA+, Pós-fixado CDI etc.) via `fi_type`
- ✅ `AssetTable.tsx` — badge "N aguardando valor", fundo âmbar para `needs_manual`, "Informar →" na coluna de preço, total exclui ativos sem valor
- ✅ `DashboardPage.tsx` — `handleAssetClick` abre modal correto: `ManualValueModal` para `manual`/`error`, `FixedIncomeSetupModal` para `fixed_income`

#### Nova rota backend
- ✅ `backend/src/routes/assets.ts` — CRUD de valores manuais:
  - `GET /api/assets/:id/manual-values` — histórico (últimas 24 entradas)
  - `POST /api/assets/:id/manual-value` — upsert `{ ref_date, value, currency, notes }`
  - `DELETE /api/assets/:id/manual-value/:valueId` — remove entrada
  - `PATCH /api/assets/:id` — atualiza `fi_principal`, `fi_start_date`, `fi_type`, `fi_rate`, `fi_spread`

### Bugs corrigidos nesta sessão

#### Bug: sync-history reportava sucesso mas não gravava no banco
Causa raiz: `supabaseAdmin.from('price_history').upsert(...)` nunca lança exceção — retorna `{ error }` no objeto. Código não checava esse campo e sempre incrementava `synced`.

- ✅ `portfolio.ts` — upsert agora desestrutura `{ error: upsertErr }` e lança se houver erro; `synced` só incrementa após gravação confirmada

#### Bug: `fi_rate=null` rejeitava NTN-B (IPCA+) incorretamente
Causa raiz: validação antiga exigia `fi_rate != null` para todos os tipos de renda fixa, mas IPCA+ usa `fi_spread` (não `fi_rate`).

- ✅ `fixedIncomeService.ts` — interface `FixedIncomeAsset.fi_rate` alterada para `number | null`; `calcPosCDI` e `calcPre` usam `fi_rate!` (garantido pelo guard anterior)
- ✅ `priceService.ts` — validação corrigida: `fi_rate` obrigatório apenas para tipos não-IPCA+
- ✅ `portfolio.ts` — `needs_manual` check: `(a.fi_type !== 'ipca_plus' && a.fi_rate == null)`

#### Bug: BTC/ETH/SOL apareciam como "Informar →" após sync
Causa raiz: CoinGecko sem try/catch em `getCurrentPrice` — rate limit após sync propagava exceção e nunca tentava Yahoo Finance como fallback.

- ✅ `priceService.ts` — `getCurrentPrice` agora tem try/catch em torno de CoinGecko e Yahoo: `brapi → CoinGecko → Yahoo` com fallthrough completo

#### Bug: sync-history usava apenas Yahoo para histórico (ordem errada)
- ✅ `priceService.ts` — `getMonthlyHistory` reordenado: Yahoo primeiro (suporta B3/.SA sem token), depois brapi, depois CoinGecko. Resultado: 49/50 ativos sincronizados com sucesso (TARPON excluído — manual)

### Estado atual do dashboard
- ✅ 57/57 ativos visíveis
- ✅ Ativos automáticos (ações, FIIs, ETFs, cripto, renda fixa completa): valor calculado
- ✅ Ativos pendentes (TARPON, CDB BTG, NTN-B 35/P35/45, NATIXIS, REVOLUT): badge âmbar + modal ao clicar
- ✅ Total BRL / USD / EUR nos cards superiores

---

## Sessão 6 — Features completas: Detalhe, Moeda, Aportes, Perfil, Benchmarks (11/05/2026) ✅ CONCLUÍDA

### O que foi construído

#### Tela de detalhe do ativo (`AssetDetailPage.tsx` + `GET /api/assets/:id/detail`)
- ✅ Cards: valor atual, investido, ganho/perda (com %), holdings, peso no portfólio
- ✅ Gráfico de linha com histórico de preços (ticker: price_history; manual: manual_values)
- ✅ Tabela de contribuições com badges buy/sell
- ✅ Botão "Voltar" (navigate(-1))
- ✅ Bug corrigido: `invested_brl` agora usa `price_orig × qty × (fx_rate_brl ?? 5.70)` quando `value_brl` é null (seeds de ações USA e cripto não tinham value_brl)
- ✅ Bug corrigido: gráfico filtrado por `.lte('ref_date', today)` — remove pontos futuros (2026-05) gerados pelo sync

#### Seletor de moeda base (`CurrencyContext.tsx`)
- ✅ Context provider: `currency`, `setCurrency`, `fxRates`, `convert()`, `fmt()`
- ✅ Persiste em `localStorage('preferredCurrency')`
- ✅ Busca taxas do backend `/api/fx/current?pairs=USD-BRL,EUR-BRL`
- ✅ Botões BRL/USD/EUR no header
- ✅ Dashboard, AssetTable e ValueCards usam `fmt()` da moeda selecionada

#### Tela de Aportes (`ContributionsPage.tsx` + `contributions.ts`)
- ✅ `GET /api/contributions` — lista todos os aportes com info do ativo
- ✅ `POST /api/contributions` — cria novo aporte
- ✅ `DELETE /api/contributions/:id` — remove (valida posse via join)
- ✅ Frontend: formulário + tabela com delete; seletor de ativo carregado do portfólio

#### Autocomplete de Instituição (`InstitutionSelect.tsx` + `institutions.ts`)
- ✅ `GET /api/institutions` — 3 grupos: Bancos BR (BrasilAPI, cache 24h), Internacional (estático), Personalizado (exchange únicos do banco)
- ✅ Cache module-level no frontend; dropdown agrupado com "Adicionar X" quando sem match exato
- ✅ Integrado ao `FixedIncomeSetupModal`

#### Modal Renda Fixa melhorado (`FixedIncomeSetupModal.tsx`)
- ✅ `fi_type` agora é selecionável via `<select>` (Pós-fixado CDI / Selic / Pré-fixado / IPCA+)
- ✅ Troca de tipo limpa o campo correto: IPCA+ usa `fi_spread`, demais usam `fi_rate`; null é enviado para o campo inativo
- ✅ Campo de taxa com label/placeholder/hint dinâmicos por tipo
- ✅ Campos adicionados: taxa contratada, vencimento (opc.), instituição financeira

#### Ponto zero da carteira (`POST /api/portfolio/reset-baseline`)
- ✅ Endpoint deleta todas as contribuições de `2023-01-01` e recria em `2025-01-01`
- ✅ Preços históricos reais via `yahoo.getPriceAtDate(ticker, '2025-01-01')` — consulta janela ±7 dias para pegar primeiro dia útil
- ✅ Fetches em paralelo (`Promise.all`) para todos os ativos
- ✅ Calcula `value_brl = price × qty × fx` para ativos USD/EUR
- ✅ Botão com confirmação na PerformancePage (seção "Ferramentas avançadas")
- ✅ `yahooService.ts` — nova função `getPriceAtDate(ticker, date)`

#### Perfil do usuário (`ProfilePage.tsx` + `profile.ts`)
- ✅ `GET/PATCH /api/profile` — lê e salva nome, país, data início portfólio em Supabase Auth `user_metadata`
- ✅ `PATCH /api/profile/password` — troca senha via `supabaseAdmin.auth.admin.updateUserById`
- ✅ Frontend: avatar com iniciais, formulário de dados pessoais, seletor de moeda padrão, seção de troca de senha
- ✅ Email no header vira link para `/profile`

#### Benchmarks na Performance (`GET /api/performance/benchmarks`)
- ✅ CDI: agrega taxas diárias BCB série 12 em retorno mensal acumulado
- ✅ IBOV: Yahoo Finance `^BVSP` histórico mensal — normalizado para índice (100 = jan)
- ✅ S&P500: Yahoo Finance `^GSPC` histórico mensal — normalizado
- ✅ Chart: botões toggle CDI/IBOV/S&P500 sobrepõem linhas tracejadas no eixo Y direito (%)
- ✅ Cards de comparação: CDI%, IBOV%, S&P500% do ano abaixo do gráfico
- ✅ `PerformanceBenchmarks` e `BenchmarkMonthly` adicionados em `types.ts`
- ✅ Hook `usePerformanceBenchmarks(year)` adicionado em `usePortfolio.ts`

#### NTN-B — fallback BrasilAPI (`bcbService.ts`)
- ✅ `getIPCARates` agora tem try/catch: se BCB série 433 falhar, busca taxa anual atual em `brasilapi.com.br/api/taxas/v1/ipca` e gera série mensal aproximada (cache 6h)

### Bugs corrigidos nesta sessão

#### Bug: `invested_brl` mostrava "—" para ações USA e cripto
Causa raiz: seed não preenchia `value_brl` para aportes em USD (sem `fx_rate_brl`). Backend usava `c.value_brl ?? 0`.
- ✅ `assets.ts` — fallback: `c.value_brl ?? (c.price_orig != null ? c.price_orig * qty * (c.fx_rate_brl ?? 5.70) : 0)`

#### Bug: gráfico de detalhe mostrava ponto futuro (Mai/26)
Causa raiz: `sync-history` gravava o mês corrente (`2026-05-01`) na `price_history`.
- ✅ `assets.ts` — query de price_history agora filtra `.lte('ref_date', today)`

### Estado atual do sistema

| Feature | Status |
|---|---|
| Dashboard 57 ativos | ✅ funcional |
| Seletor moeda BRL/USD/EUR | ✅ funcional |
| Detalhe do ativo (P&L + gráfico + aportes) | ✅ funcional |
| Tela de Aportes (CRUD) | ✅ funcional |
| Modal Renda Fixa (tipo selecionável + taxa + vencimento + instituição) | ✅ funcional |
| Ponto zero 2025-01-01 com preços reais | ✅ endpoint pronto |
| Perfil do usuário (nome, país, senha) | ✅ funcional |
| Performance com benchmarks CDI/IBOV/S&P500 | ✅ funcional |

### Pendências

#### Dados a preencher pelo usuário (via modal)
- [ ] TARPON — registrar valor atual em `manual_values`
- [ ] CDB BTG — informar `fi_principal` e `fi_start_date` via modal
- [ ] NTN-B 35 / NTN-B P35 / NTN-B 45 — informar `fi_principal`
- [ ] NATIXIS — registrar valor atual em EUR via modal
- [ ] REVOLUT — registrar saldo atual em EUR via modal
- [ ] Acionar "Resetar 2023 → 2025" na aba Performance para recalcular ponto zero

#### Features planejadas
- [ ] Settings Page: targets de alocação por classe
- [ ] Exportar CSV de aportes / extrato
- [ ] Notificações / alertas de rebalanceamento

#### Deploy
- [ ] Variáveis de ambiente de produção
- [ ] Deploy: Vercel (frontend) + Railway (backend)

---

## Referências rápidas

| Item | Valor |
|---|---|
| Supabase projeto | `bkgpivxpzuzedezxtknd` |
| Supabase URL | `https://bkgpivxpzuzedezxtknd.supabase.co` |
| UUID do usuário André | `453bc770-0cea-4c88-b72f-babf9e50437e` |
| Frontend dev | `http://localhost:5174` |
| Backend dev | `http://localhost:3001` |
| Credenciais | `frontend/.env` (não commitar) |

## Como iniciar a próxima sessão

Cole no Claude Code:

```
Projeto: Portfolio Tracker genérico (brasileiro no exterior, multi-moeda)
Stack: React + Vite + Tailwind (frontend :5174), Node/Express (backend :3001), Supabase
Progresso: portfolio-tracker/PROGRESS.md
Sessões 1-6 concluídas — sistema completo com dashboard, detalhe de ativos, aportes, perfil, benchmarks
Próximo objetivo: ver pendências na sessão 6 do PROGRESS.md
UUID André: 453bc770-0cea-4c88-b72f-babf9e50437e
```
