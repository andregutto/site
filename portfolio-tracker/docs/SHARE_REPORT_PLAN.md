# Plano — Relatório de Portfólio Compartilhado (reformulação completa)

> **Para a sessão de execução (Sonnet).** Documento autocontido. Ordem de leitura:
> (1) Diagnóstico — por que os valores não batem; (2) Inventário de dados — o que a
> ferramenta já calcula e hoje fica de fora; (3) Benchmark Finary/Monarch; (4) Estrutura
> do relatório (conteúdo seção a seção); (5) Fases de execução.
>
> **Regra de ouro:** Fases 1–2 (dados) são pré-requisito. Sem elas o relatório fica bonito
> e errado. Fase 3 é conteúdo+design. Não inventar métrica nova no relatório: tudo que
> entra já existe num endpoint — é questão de capturar no snapshot e exibir bem.

## Contexto

Dashboard → botão "Compartilhar" (modal em `DashboardPage.tsx:63+`) → `POST /api/portfolio/share-link`
gera um **snapshot** congelado salvo em `portfolio_shares.snapshot` (JSON). A página pública
`/p/:token` (`PublicPortfolioPage.tsx`) lê via `GET /api/public/portfolio/:token` e renderiza
relatório + "Baixar PDF" (`window.print()`, já há `PRINT_CSS`).

Reclamações do usuário:
- **(A)** Valores não batem com o Dashboard (total, alocação, gráficos).
- **(B)** Relatório muito aquém de uma instituição financeira / players como **Finary** e
  **Monarch** — tanto em **conteúdo** (falta o que mais importa) quanto em **design**.

---

## 1. Diagnóstico — causa raiz de (A) (confirmado lendo o código)

Existem **dois caminhos de cálculo separados**, e o do relatório é uma versão inferior e bugada.

| | Dashboard (`GET /portfolio/value`) | Snapshot (`buildPortfolioSnapshot`, `portfolio.ts:500`) |
|---|---|---|
| Preço ticker | `getCurrentPrice()` **ao vivo** | última linha de `price_history` |
| Renda fixa | `getCurrentPrice()` ao vivo (BCB + tranches) | `fi_principal` cru (sem rendimento) |
| Câmbio | `getFxRate()` ao vivo | `fx_rates` tabela / hardcode `5.70/6.40/7.20` |
| Aportado/retorno | lógica completa (inclui manual oldest-value) | só soma `value_brl` de compras |

**Bug crítico nº 1 — query lê colunas inexistentes.** `portfolio.ts:526`:
```ts
.from('price_history').select('asset_id, value, currency, date').gte('date', ...).order('date'...)
```
Schema real (`migrations/001_initial_schema.sql:92`): `price_history(id, asset_id, ref_date, price, currency, source, created_at)`.
**Não existe `value` nem `date`** (são `price` e `ref_date`). A query volta vazia → `lastPriceMap`
vazio → cada ticker cai em `investedMap` (linha 568) → **o relatório mostra o valor APORTADO
(custo), não o de mercado.** É o motivo nº 1 dos gráficos não baterem.

**Bug nº 2 — renda fixa sem rendimento:** RF nunca entra em `price_history` (CLAUDE.md), cai em
`fi_principal` cru. **nº 3 — câmbio divergente** (taxa velha vs ao vivo). **nº 4 — cores do donut
erradas:** usa `SECTOR_PALETTE[i]` em vez de `c.color` real (`PublicPortfolioPage.tsx:264-266`).
**nº 5 — geografia só sobre top 12** (`portfolio.ts:591` + agregação client-side em `:136-150`).
**nº 6 — snapshot congelado:** mesmo correto, é uma foto do momento da geração.

**Princípio da solução:** fonte única de verdade. O snapshot não tem matemática própria —
reaproveita o cálculo do Dashboard e só serializa/recorta o resultado.

---

## 2. Inventário de dados — o que existe e hoje NÃO entra no relatório

Tudo abaixo já é calculado pela ferramenta. O relatório atual usa só as 3 primeiras linhas.

| Dado | Endpoint | Hoje no relatório? |
|---|---|---|
| Patrimônio total, por classe, por ativo | `GET /portfolio/value` | ✅ (mas via snapshot bugado) |
| Geografia (por bolsa) | derivado no cliente | ⚠️ parcial (top 12) |
| Renda passiva (total 12m, mensal) | snapshot | ✅ básico |
| **Retorno do período (Modified Dietz): início, fim, aportes, retorno abs/%** | `GET /performance/summary` | ❌ |
| **Evolução patrimonial mensal (valor de mercado × aportes acumulados)** | `GET /performance/monthly` (+ `/daily`) | ❌ |
| **Desempenho vs benchmarks (CDI, IBOV, S&P500) — cumulativo + % final** | `GET /performance/benchmarks` | ❌ |
| **Data de início da carteira (inception)** | `GET /performance/inception` | ❌ |
| **Retorno por ativo (maiores altas/baixas)** | `GET /performance/asset-returns` | ❌ |
| **Setor (Tech, Financeiro, Imobiliário, Cripto, RF…)** | `GET /portfolio/sector-data` | ❌ |
| **Exposição por moeda (BRL/USD/EUR)** | derivável de `by_asset[].currency` | ❌ |
| **Concentração / diversificação (HHI normalizado)** | calculado em `DiversificationPage` (`calcHHI`/`normalizeHHI`) | ❌ |
| **Dividendos detalhados: por ativo (top pagadores), por mês, total, yield** | `GET /dividends/summary` | ❌ parcial |
| Metas de alocação / drift (atual × alvo) | `RebalancePage` / classes com `target` | ❌ (incluir se houver alvos definidos) |

> Não incluir no relatório público: **relatórios fiscais** (`reports.ts` França/Brasil) e
> **finanças pessoais** (orçamento, transações, contas) — são sensíveis e fora do escopo de
> um relatório de *portfólio de investimentos*.

---

## 3. Benchmark — Finary & Monarch (o que torna um relatório "top player")

**Conteúdo (o que eles sempre mostram):**
- **Evolução do patrimônio** ao longo do tempo (área), separando aporte de valorização.
- **Performance com retorno ponderado** e **comparação contra benchmark** (alpha) — não só "subiu X%".
- **Alocação multidimensional**: classe, **geografia**, **setor**, **moeda**, conta/instituição.
- **Holdings** em tabela densa com peso **e retorno individual**.
- **Top movers** (melhores/piores do período).
- **Renda passiva** com **yield** (sobre patrimônio e sobre custo).
- **Diversificação/concentração** como métrica explícita.

**Design (linguagem visual):**
- Sóbrio, data-dense porém arejado; paleta neutra com **um** acento; números **tabulares**.
- Hierarquia tipográfica forte (rótulo pequeno em caixa-alta + número grande).
- Gráficos certos para cada coisa: **área** p/ evolução, **linha** p/ benchmark, **donut**
  p/ alocação, **barra horizontal** p/ holdings/movers.
- Tabelas estilo extrato: hairlines, zebra leve, números à direita.
- Seções com respiro e quebras de página limpas (este relatório é **print-first** → PDF A4).

Alinhar a paleta/tipografia ao `docs/UI_REDESIGN_PLAN.md` (off-white `#F4F3F1`, display serif +
body, ouro `#C8B89A` pontual, `tabular-nums`). Tom Arvo = mais "private banking sóbrio" que
"fintech colorida": menos gradiente/glow, mais documento.

---

## 4. Estrutura do relatório (conteúdo seção a seção)

Ordem proposta. Cada seção só renderiza se houver dados; com `show_values=false` esconder
valores absolutos e manter percentuais/retornos.

1. **Capa institucional** — logo Arvo · Capital, "Relatório de Portfólio", nome do titular,
   linha de metadados estilo extrato: *Data-base · Moeda · Período · Gerado em*. Sem wave/glow.

2. **Sumário executivo** (primeira dobra) — KPIs grandes:
   - Patrimônio total + variação no período (abs + %);
   - Retorno do período (Modified Dietz) **e** desde o início;
   - Aportes no período; Renda passiva 12m; nº de ativos / classes.

3. **Evolução patrimonial** — gráfico de **área**: valor de mercado mensal × aportes
   acumulados (a "linha de aportes" já existe em `/performance/monthly`). Mostra quanto do
   crescimento foi aporte vs valorização. Marcar inception.

4. **Desempenho vs benchmarks** — tabela **Carteira × CDI × IBOV × S&P 500** (% no período e
   desde início) + gráfico de **linhas cumulativas** (`/performance/benchmarks`). Destacar o
   alpha (carteira − benchmark) com cor discreta.

5. **Alocação (multidimensional)** — o grande diferencial. Abas/blocos:
   - **Por classe** (donut com **cores reais** + tabela classe/valor/%);
   - **Por geografia** (sobre o universo completo — ver Fase 2);
   - **Por setor** (`sector-data`) — novo;
   - **Por moeda** (exposição cambial BRL/USD/EUR) — novo;
   - **Atual × Alvo** (drift) **se** o usuário tiver metas de alocação definidas.

6. **Concentração & diversificação** — score HHI normalizado (0–100) + frase contextual
   (reaproveitar a lógica de `DiversificationPage`), "top 5 = X% da carteira", nº de posições.

7. **Principais posições** — **tabela formal**: Rank · Ticker · Nome · Classe · Peso % ·
   (Valor) · **Retorno do ativo %** (`asset-returns`). Barra de proporção sutil; `break-inside: avoid`.

8. **Destaques de desempenho** — **maiores altas / maiores baixas** do período
   (`asset-returns`), em duas colunas de barras horizontais.

9. **Renda passiva** — total 12m, média mensal, **yield** (renda 12m ÷ patrimônio),
   gráfico mensal + **top pagadores** (`dividends/summary.by_asset`).

10. **Rodapé institucional** — disclaimer ("relatório informativo, não constitui recomendação
    de investimento"), **nota de metodologia** (retorno por Modified Dietz; data-base; fontes
    de preço), marca Arvo, CTA "Crie o seu" (só na tela; escondido no print).

**Controles no modal de compartilhar** (`DashboardPage.tsx`): manter `show_values`; adicionar
(a) toggle **"Ocultar ativos individuais"** (`hide_holdings`) — ver Decisões tomadas;
(b) seletor de período para performance/benchmark (Desde o início / 12m / YTD). Tornar
**"Atualizar dados" proeminente** (regenera o snapshot) e exibir **"Dados de {data}"** para
deixar claro que é uma foto.

---

## 5. Fases de execução

### Fase 1 — Fonte única de verdade do valor (backend) ⬅ pré-requisito
Extrair a lógica inline de `GET /portfolio/value` (`portfolio.ts:14-254`) para
`export async function computePortfolioValue(userId): Promise<...>` (em `portfolio.ts` ou
`services/portfolioValue.ts`). O handler vira wrapper fino com o cache atual. **Sem mudança
de comportamento no Dashboard.** ✓ `GET /portfolio/value` retorna JSON idêntico.

### Fase 2 — Snapshot rico e correto (backend)
Reescrever `buildPortfolioSnapshot(userId, displayCurrency, period)` para:
1. Chamar `computePortfolioValue` → base de valor/classe/ativo correta (mata bugs 1–4).
2. **Remover** a query bugada de `price_history` e todo o cálculo paralelo.
3. Agregar **geografia, setor e moeda sobre TODO o `by_asset`** (mata bug 5); preservar
   `color`/`name_key` reais das classes.
4. Capturar as séries/métricas para o novo conteúdo, chamando/реusando os serviços existentes:
   `performance/summary`, `/monthly`, `/benchmarks`, `/inception`, `/asset-returns`,
   `dividends/summary`. (Reaproveitar as funções desses handlers — extrair para serviço se
   preciso, sem duplicar matemática.)
5. Calcular HHI/diversificação no backend (mesma fórmula de `DiversificationPage`).
6. Câmbio para `displayCurrency` via `getFxRate` ao vivo.
7. Atualizar shapes: `public.ts` (resposta), interface `PublicData` e
   `PublicPortfolioPage.tsx:11-26`. Geografia/setor/moeda passam a vir prontos do backend;
   remover o recálculo client-side (`:136-150`).
8. Respeitar `show_values`: zerar/`null` valores absolutos mantendo %/retornos.

✓ **Critério que prova (A) resolvido:** gerar link logo após abrir o Dashboard →
`portfolio_value` do relatório **==** `total_brl` do Dashboard; classes somam o total; %
idênticos; **cores das fatias == cores das classes** no Dashboard.

### Fase 3 — Conteúdo + design nível Finary/Monarch (frontend)
Reescrever `PublicPortfolioPage.tsx` implementando a **Estrutura da seção 4** com a
**linguagem visual da seção 3**:
- Remover wave SVG/glow; capa e seções sóbrias, tabelas estilo extrato, `tabular-nums`.
- Gráficos: área (evolução), linha (benchmark), donut com cores reais (alocação), barras
  horizontais (holdings/movers). Reusar Recharts já presente.
- Estado "sem valores" coerente (esconde colunas de valor, mantém % e retornos).
- **Print/PDF**: revisar `PRINT_CSS` para o novo layout — quebras limpas entre grupos de
  seções (`arvo-pdf-break`), cores exatas (`print-color-adjust`), A4. Testar o `window.print()` real.
- **i18n**: reusar chaves de `sharePortfolio` (`i18n/pt.json:1800`); adicionar novas
  (performance, benchmark, setor, moeda, concentração, yield, disclaimer, metodologia) nos
  **três** idiomas (`pt`/`en`/`fr`).

✓ **Critério Fase 3:** o PDF parece relatório de gestora/Finary — denso, tabelas alinhadas,
hierarquia tipográfica, gráficos certos, sem elementos casuais; responsivo na tela; coerente
com e sem valores; impressão sem cortes.

---

## Arquivos envolvidos
- `backend/src/routes/portfolio.ts` — `computePortfolioValue` (F1); reescrever `buildPortfolioSnapshot` (F2).
- `backend/src/routes/performance.ts`, `dividends.ts` — extrair funções reutilizáveis p/ o snapshot (F2).
- `backend/src/routes/public.ts` — novo shape do JSON público (F2).
- `frontend/src/pages/PublicPortfolioPage.tsx` — reformulação conteúdo+design (F3).
- `frontend/src/pages/DashboardPage.tsx` — modal: período/seções/atualizar (F3).
- `frontend/src/i18n/{pt,en,fr}.json` — chaves novas (F3).
- (Referência) `frontend/src/pages/DiversificationPage.tsx` — fórmula HHI; `migrations/001_initial_schema.sql` — schema.

## Verificação
Sem suíte de testes (CLAUDE.md). Validar `npx tsc --noEmit` em `backend/` e `frontend/`,
teste manual no app, geração de link real e conferência numérica relatório × Dashboard,
e inspeção do PDF gerado.

## Decisões já tomadas (pelo usuário — implementar assim)
- **Modelo = snapshot congelado** (não ao vivo). Manter a foto gerada no `POST /share-link`,
  com botão **"Atualizar dados" em destaque** (regenera o snapshot) e **"Dados de {data}"**
  sempre visível no relatório e no modal. O link público **não** recomputa a cada visita.
- **Privacidade em dois níveis:** além do `show_values` (esconde valores absolutos, mantém %),
  adicionar um segundo toggle **"Ocultar ativos individuais"** que esconde tickers/nomes —
  mostra só classes/setores/geografia/moeda. Persistir essa flag no `portfolio_shares` (nova
  coluna, ex. `hide_holdings boolean default false`) e respeitá-la no `public.ts` (não enviar
  `top_assets`/nomes quando ligada) e no `PublicPortfolioPage.tsx` (esconder seções 7 e 8).
- **Benchmarks entram nesta versão.** Seções 3 (evolução) e 4 (desempenho vs CDI/IBOV/S&P)
  fazem parte do escopo. Dependem das séries de `performance` (sync-history): se o usuário
  ainda não sincronizou histórico, essas seções devem **degradar com elegância** (ex.: aviso
  discreto "histórico indisponível — sincronize para ver desempenho") em vez de quebrar ou
  mostrar zeros.
