import { Router, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { haversineKm, buildCostSummary } from './voyage.js'

const router = Router()

function buildSystemPrompt(opts: { locale: string; currentPath: string; today: string }): string {
  const lang = opts.locale === 'fr' ? 'French' : opts.locale === 'en' ? 'English' : 'Brazilian Portuguese'
  return `You are a helpful assistant built into a personal finance and investment portfolio tracker app, which also includes a trip-planning module called Voyage. Your role is strictly limited to two things: (1) helping users navigate and use the app, and (2) answering questions about the user's own data using the available tools.

## Session context
- Today's date: ${opts.today}
- User's language: ${lang} — respond ONLY in this language, regardless of what language the system prompt is written in.
- Current page the user is on: ${opts.currentPath}

## Response style — always apply
- Be concise and direct. Short answers are better than long ones.
- For market news or external context (web searches): give 2–4 bullet points max. No intro paragraph, no closing summary — the bullets ARE the answer.
- For data lookups (portfolio, transactions): show the numbers, add one line of context if useful. Stop there.
- Never repeat information you already stated in a different form.
- If the full answer fits in one sentence, use one sentence.

## CRITICAL: Data accuracy rule
NEVER invent, guess, or assume the user's financial data. For any question about portfolio, transactions, accounts, or spending, you MUST call the appropriate tool first. If a tool returns empty results, say so honestly — do not make up numbers.

When the user mentions an asset by partial name or code (e.g. "minha Petrobras", "PETR", "conta Nubank", "meu bitcoin"), call search_asset with the partial name before answering. When user asks about a merchant or company spending (e.g. "quanto gastei no Carrefour", "todas as cobranças da Prixtel"), call get_merchant_spending; if it returns nothing, call list_merchants to find the actual name used in the statement.

For ANY question about the user's trips (Voyage module — itinerary, places, destinations, distances between places, route order), you MUST call the Voyage tools below first. Never invent trip names, place names, distances, or day numbers.

## Voyage (trip planner) module

Voyage lets users plan trips with day-by-day itineraries: each trip has one or more destinations (cities, with a day range), and a list of places (POIs, restaurants, hotels, etc.) each with optional GPS coordinates and an assigned day number.

- **Viagens** (/voyage) — list of trips, each with cover, destinations, dates, status, and total cost
- A trip page (/voyage/:id) has: hero (title, destinations, dates, status), a day-by-day itinerary (places grouped by day_number, each with category/address/notes), and a map
- Trip costs come from linked "momentos" (the same Finanças concept) — use get_trip_cost for a trip-specific cost breakdown

Voyage tools:
- **list_trips** — overview of all the user's trips (owned or as active member): title, destinations, dates, status, place count. ALWAYS call this first if the user refers to "minha viagem"/"my trip" without naming one, or asks "quais viagens eu tenho".
- **get_trip_itinerary** — full day-by-day itinerary for one trip: every place with its day, category, address, and lat/lng if geocoded. Use this whenever the user asks about the order of places, what's planned for a specific day, or wants the place list for a trip. If you don't know the trip_id, call list_trips first and match by title/destination.
- **calculate_route_distance** — given a list of place names (or "all places in trip X in itinerary order"), computes the geographic (great-circle) distance in km between consecutive places and the total route distance. Use this for ANY distance/route/"how far"/"quantos km" question about places in a trip. This is straight-line distance, not driving distance — if the user asks for driving/walking time, say this tool gives straight-line distance as an estimate and real road distance may be longer.

When the user asks something like "qual a distância entre os lugares do dia 3" or "quantos km vou rodar nessa viagem", call get_trip_itinerary first (if you don't already have the place list with coordinates), then call calculate_route_distance with the relevant place_ids in the order they should be visited.

## Hard boundaries — never cross these

You must NEVER:
- Recommend, suggest, or evaluate any specific investment
- Give buy/sell/hold opinions on any asset or market
- Predict or comment on future performance of any asset, index, or market
- Analyze the user's portfolio from an advisory perspective ("your allocation looks risky", "you should diversify more")
- Suggest rebalancing, allocation strategies, or risk management approaches
- Comment on whether financial decisions were good or bad
- Provide tax advice of any kind
- Act as a financial planner, investment advisor, or any regulated professional

These restrictions exist because providing investment advice without a license violates regulations (CVM/BACEN in Brazil, MiFID II/ESMA in the EU). Politely decline if asked, and suggest a qualified advisor.

## What you CAN do
- Show the user their data: portfolio, performance, dividends, IR/tax report, spending, transactions, accounts (use the tools)
- Explain how any feature in the app works, including IR report, rebalancing, moments, freedom simulator
- Guide navigation step by step
- Clarify what numbers mean in the app context
- Search the web for recent market news, macro events, or company-specific news to contextualise why an asset or the portfolio moved — use web_search for this
- After web search, summarise what happened in the market and correlate with the user's data — but NEVER suggest action based on it

## App navigation — exact routes

The top navigation has two sections: **Investimentos** and **Finanças**.

### Investimentos (investment portfolio)
- **Dashboard** (/dashboard) — total portfolio value, performance chart, full asset list with allocation by class. Click any asset row to open its detail page.
- **Performance** (/performance) — historical charts and monthly breakdown
- **Aportes** (/portfolio) — record buy/sell/income operations; also where you add new assets via the "Novo ativo" button at the top right
- **Rebalancear** (/portfolio/rebalance) — set and review allocation targets by class
- **Instituições** (/institutions) — assets grouped by institution/broker; also manages finance accounts (bank accounts)
- **Classes** (/portfolio/classes) — create and manage asset classes (color groups: Ações BR, FIIs, Renda Fixa, Cripto, Internacional, Caixa…)
- **IR** (/portfolio/reports) — tax report: capital gains, dividends, year-end positions
- **Índices** (/portfolio/indices) — market index comparison
- **Favoritos** (/favorites) — starred assets
- **Arquivados** (/archived) — closed positions

There is NO separate "Ativos" menu item. Individual asset pages are reached by clicking an asset on the Dashboard or in Aportes. Asset URL: /assets/:id

Asset detail page — all fields are inline-editable:
- **Class** (colored badge next to ticker code) → click → select from dropdown → saves automatically
- **Type/Sector** ("+ tipo" tag) → click to type a label (e.g., CDB, ETF, Ação)
- **Name** → click to edit inline
- **Institution** (bottom-right area) → click to open selector
- **FI indexer** (Renda Fixa only) → "Editar" button in the blue card
- Action buttons: "+ Aporte", "Atualizar valor" (manual assets only), "Converter para RF", "Arquivar"

Asset types:
- ticker (B3): Brazilian stocks/ETFs/FIIs — prices from Brapi
- ticker (international): US/global stocks/ETFs — prices from Yahoo Finance
- ticker (crypto): Cryptocurrencies — prices from CoinGecko
- fixed_income: CDBs, LCIs, LCAs, Tesouro Direto — calculated from BCB (CDI, IPCA, Selic)
- manual: Unlisted assets — user updates value manually on the asset detail page

### Finanças (personal finance)
- **Visão Geral** (/finances) — monthly income vs expense summary with envelope breakdown
- **Planejamento** (/finances/budget) — configure spending envelopes and monthly limits (this is sometimes called "Orçamento" in older docs, but the menu shows "Planejamento")
- **Transações** (/finances/transactions) — full transaction list with categories, moments, notes, CSV import, and reimbursement groups
- **Momentos** (/finances/moments) — group transactions into named life events (trips, celebrations) with a shareable public link
- **Liberdade** (/finances/freedom) — financial freedom simulator: plan capital, contribution, rate, and horizon
- **Contas** → redirects to Instituições (/institutions) — the Contas menu item in Finanças takes you to the same Instituições page

Finance concepts:
- Envelopes: monthly budget buckets (Gastos Essenciais, Investimentos, Reserva, Lazer…)
- Categories: sub-categories within envelopes — auto-detected on CSV import via keyword rules + AI
- Moments: named life events with grouped transactions
- Accounts: bank accounts under Instituições (e.g., Revolut EUR, C6 BRL)
- Reimbursement groups: link related transactions so only the net amount counts in calculations

## Key actions
- Add new asset: Investimentos → Aportes → "Novo ativo" button (top right)
- Record a buy/sell: Investimentos → Aportes → "Novo aporte"
- Change an asset's class: Dashboard → click asset row → click the colored class badge → select class
- Update manual asset value: Dashboard → click asset → "Atualizar valor" button
- Import transactions (CSV/OFX): Finanças → Transações → upload icon button (top right)
- Set budget envelopes: Finanças → Planejamento
- View all transactions: Finanças → Transações
- Manage asset classes: Investimentos → Classes
- See accounts and balances: Investimentos → Instituições (or Finanças → Contas)`
}

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    type: 'web_search_20250305' as const,
    name: 'web_search',
    max_uses: 4,
  } as unknown as Anthropic.Messages.Tool,
  {
    name: 'search_asset',
    description: 'Search for a specific asset by partial code or name. ALWAYS use this when the user mentions an asset by any name or ticker — even partial. Returns current value, invested amount, and gain/loss.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Partial or full asset code or name (case-insensitive)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_portfolio_summary',
    description: 'Get the full portfolio: all assets with type, class, invested and current values. Use when the user asks about total portfolio or multiple assets at once.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_spending_by_category',
    description: 'Get expense totals grouped by category for a period. Use when asked about spending patterns, biggest expenses, or costs by category.',
    input_schema: {
      type: 'object' as const,
      properties: {
        months: { type: 'number', description: 'Recent months to include (default 3)' },
        year:   { type: 'number', description: 'Specific year (optional)' },
        month:  { type: 'number', description: 'Specific month 1-12 (optional)' },
      },
    },
  },
  {
    name: 'get_transactions',
    description: 'Get transactions with optional filters. Use for browsing recent transactions or searching by keyword. For spending totals with a specific merchant, use get_merchant_spending instead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit:     { type: 'number', description: 'Max rows (default 20)' },
        from_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
        to_date:   { type: 'string', description: 'End date YYYY-MM-DD' },
        type:      { type: 'string', enum: ['expense', 'income'] },
        search:    { type: 'string', description: 'Search in description (case-insensitive, partial match). Returns up to 200 rows.' },
      },
    },
  },
  {
    name: 'get_merchant_spending',
    description: 'Total spending with a specific merchant/company. Use when the user asks "how much did I spend with X", "total at Y", etc. Tries fuzzy word-based matching automatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        merchant:  { type: 'string', description: 'Merchant or company name (partial match, tries word by word)' },
        from_date: { type: 'string', description: 'Start date YYYY-MM-DD (optional, defaults to all time)' },
        to_date:   { type: 'string', description: 'End date YYYY-MM-DD (optional)' },
      },
      required: ['merchant'],
    },
  },
  {
    name: 'list_merchants',
    description: 'List the most frequent merchant names from the user\'s transactions. Use when get_merchant_spending returns nothing — helps find the actual name used in the bank statement.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit:  { type: 'number', description: 'Max merchants to return (default 40)' },
        type:   { type: 'string', enum: ['expense', 'income'] },
        search: { type: 'string', description: 'Filter descriptions containing this word (optional)' },
      },
    },
  },
  {
    name: 'get_financial_summary',
    description: 'Monthly income vs expense summary. Use when the user asks about cash flow, savings, or monthly balance.',
    input_schema: {
      type: 'object' as const,
      properties: {
        months: { type: 'number', description: 'Recent months (default 6)' },
      },
    },
  },
  {
    name: 'get_accounts',
    description: 'List bank/finance accounts with currency and current balance. Use when the user asks about their accounts.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_period_performance',
    description: 'Get per-asset performance (gain/loss in BRL and %) for a specific period. ALWAYS use this when the user asks what is dragging the portfolio down/up, which assets gained/lost most, or portfolio change this month/year/period. Returns assets ranked by BRL change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['last_7d', 'this_month', 'last_30d', 'ytd', 'last_12m'],
          description: 'Time window: last_7d = last 7 days (use for "last few days" questions); this_month = from 1st of current month; last_30d = rolling 30 days; ytd = since Jan 1; last_12m = rolling 12 months.',
        },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_dividends',
    description: 'Get dividend and income history (dividends, JCP, FII income, interest, coupons). Use when the user asks about dividends received, passive income, or yield from specific assets.',
    input_schema: {
      type: 'object' as const,
      properties: {
        from_date:  { type: 'string', description: 'Start date YYYY-MM-DD (optional)' },
        to_date:    { type: 'string', description: 'End date YYYY-MM-DD (optional)' },
        asset_code: { type: 'string', description: 'Filter by asset code/ticker (optional, partial match)' },
      },
    },
  },
  {
    name: 'get_tax_report',
    description: 'Get tax/IR report for a calendar year: capital gains from sells (simplified avg-cost FIFO), dividends and income received, and year-end positions. Use for any IR, imposto de renda, or tax-related question.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number', description: 'Calendar year (defaults to current year)' },
      },
    },
  },
  {
    name: 'list_trips',
    description: 'List the user\'s Voyage trips (owned or as an active member): title, destinations with day ranges, dates, status, and place count. ALWAYS call this first when the user mentions a trip without giving its exact id, or asks which trips they have.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Optional filter by title or destination city (case-insensitive, partial match)' },
      },
    },
  },
  {
    name: 'get_trip_itinerary',
    description: 'Get the full day-by-day itinerary for one trip: every place with id, name, category, address, day_number, and lat/lng coordinates (when geocoded). Use this for any question about what is planned, the order of places, a specific day, or before computing distances/routes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        trip_id: { type: 'number', description: 'The trip id (get it from list_trips first if unknown)' },
        day_number: { type: 'number', description: 'Optional: restrict to a single day' },
      },
      required: ['trip_id'],
    },
  },
  {
    name: 'calculate_route_distance',
    description: 'Compute great-circle (straight-line) distance in km between a sequence of places, using their stored coordinates. Returns leg-by-leg distances and the total. Use for any "how far", "quantos km", or route-length question about places in a trip. NOTE: this is straight-line distance, not driving distance — road distance is typically longer; say so if relevant.',
    input_schema: {
      type: 'object' as const,
      properties: {
        place_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Ordered list of trip_place ids (from get_trip_itinerary) — distance is computed leg by leg in this order',
        },
      },
      required: ['place_ids'],
    },
  },
  {
    name: 'get_trip_cost',
    description: 'Get the cost breakdown for one trip: total spent, budget, currency, breakdown by category, by place, and by person (when shared). Use for any question about how much a trip cost or its budget.',
    input_schema: {
      type: 'object' as const,
      properties: {
        trip_id: { type: 'number', description: 'The trip id (get it from list_trips first if unknown)' },
      },
      required: ['trip_id'],
    },
  },
]

async function hasVoyageTripAccess(tripId: number, userId: string): Promise<boolean> {
  const { data: trip } = await supabaseAdmin.from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip) return false
  if (trip.user_id === userId) return true
  const { data: member } = await supabaseAdmin
    .from('voyage_trip_members').select('id').eq('trip_id', tripId).eq('user_id', userId).eq('status', 'active').maybeSingle()
  return !!member
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<string> {
  try {
    switch (name) {

      case 'search_asset': {
        const q = (input.query as string ?? '').trim()
        if (!q) return 'query is required.'

        const { data: assets } = await supabaseAdmin
          .from('assets')
          .select('id, code, name, asset_type, asset_classes(name), currency')
          .eq('user_id', userId)
          .eq('active', true)
          .or(`code.ilike.%${q}%,name.ilike.%${q}%`)
          .limit(5)

        if (!assets?.length) return `No asset found matching "${q}". Try get_portfolio_summary to see all assets.`

        const ids = assets.map(a => a.id as number)
        const [{ data: contribs }, { data: manualVals }, { data: priceHist }] = await Promise.all([
          supabaseAdmin.from('contributions').select('asset_id, type, quantity, value_brl, fx_rate_brl').in('asset_id', ids),
          supabaseAdmin.from('manual_values').select('asset_id, value').in('asset_id', ids).order('ref_date', { ascending: false }),
          supabaseAdmin.from('price_history').select('asset_id, price, ref_date, currency').in('asset_id', ids).order('ref_date', { ascending: false }).limit(ids.length * 3),
        ])

        const investedMap: Record<number, number> = {}
        const holdingsMap: Record<number, number> = {}
        const lastFxMap: Record<number, number> = {}
        for (const c of contribs ?? []) {
          const brl = c.type === 'sell' ? -(c.value_brl ?? 0) : (c.value_brl ?? 0)
          investedMap[c.asset_id] = (investedMap[c.asset_id] ?? 0) + brl
          const qty = c.type === 'sell' ? -(c.quantity ?? 0) : (c.quantity ?? 0)
          holdingsMap[c.asset_id] = (holdingsMap[c.asset_id] ?? 0) + qty
          if (c.fx_rate_brl) lastFxMap[c.asset_id] = c.fx_rate_brl
        }
        const manualMap: Record<number, number> = {}
        const mSeen = new Set<number>()
        for (const mv of manualVals ?? []) {
          if (!mSeen.has(mv.asset_id)) { manualMap[mv.asset_id] = mv.value; mSeen.add(mv.asset_id) }
        }
        const priceMap: Record<number, number> = {}
        const pSeen = new Set<number>()
        for (const ph of priceHist ?? []) {
          if (!pSeen.has(ph.asset_id)) {
            const holdings = holdingsMap[ph.asset_id] ?? 0
            const fx = lastFxMap[ph.asset_id] ?? 1
            priceMap[ph.asset_id] = ph.price * holdings * fx
            pSeen.add(ph.asset_id)
          }
        }

        const lines = assets.map(a => {
          const id = a.id as number
          const cls = (a.asset_classes as unknown as { name: string } | null)?.name ?? 'No class'
          const invested = investedMap[id] ?? 0
          const current = priceMap[id] ?? manualMap[id]
          const gain = current != null ? current - invested : null
          const gainPct = gain != null && invested > 0 ? ` (${(gain / invested * 100).toFixed(1)}%)` : ''
          return [
            `${a.code} — ${a.name}`,
            `  Class: ${cls} | Type: ${a.asset_type} | Currency: ${a.currency}`,
            `  Invested: R$${invested.toFixed(0)}`,
            current != null ? `  Current value: R$${current.toFixed(0)}` : '  Current value: not available (no price history)',
            gain != null ? `  Gain/Loss: R$${gain.toFixed(0)}${gainPct}` : '',
          ].filter(Boolean).join('\n')
        })
        return `Found ${assets.length} asset(s) matching "${q}":\n\n${lines.join('\n\n')}`
      }

      case 'get_portfolio_summary': {
        const { data: assets } = await supabaseAdmin
          .from('assets')
          .select('id, code, name, asset_type, asset_classes(name), currency')
          .eq('user_id', userId)
          .eq('active', true)

        if (!assets?.length) return 'No assets found.'
        const ids = assets.map(a => a.id as number)

        const [{ data: contribs }, { data: manualVals }, { data: priceHist }] = await Promise.all([
          supabaseAdmin.from('contributions').select('asset_id, type, quantity, value_brl, fx_rate_brl').in('asset_id', ids),
          supabaseAdmin.from('manual_values').select('asset_id, value').in('asset_id', ids).order('ref_date', { ascending: false }),
          supabaseAdmin.from('price_history').select('asset_id, price, ref_date, currency').in('asset_id', ids).order('ref_date', { ascending: false }).limit(ids.length * 3),
        ])

        const investedMap: Record<number, number> = {}
        const holdingsMap2: Record<number, number> = {}
        const lastFxMap2: Record<number, number> = {}
        for (const c of contribs ?? []) {
          const brl = c.type === 'sell' ? -(c.value_brl ?? 0) : (c.value_brl ?? 0)
          investedMap[c.asset_id] = (investedMap[c.asset_id] ?? 0) + brl
          const qty = c.type === 'sell' ? -(c.quantity ?? 0) : (c.quantity ?? 0)
          holdingsMap2[c.asset_id] = (holdingsMap2[c.asset_id] ?? 0) + qty
          if (c.fx_rate_brl) lastFxMap2[c.asset_id] = c.fx_rate_brl
        }
        const manualMap: Record<number, number> = {}
        const mSeen = new Set<number>()
        for (const mv of manualVals ?? []) {
          if (!mSeen.has(mv.asset_id)) { manualMap[mv.asset_id] = mv.value; mSeen.add(mv.asset_id) }
        }
        const priceMap: Record<number, number> = {}
        const pSeen = new Set<number>()
        for (const ph of priceHist ?? []) {
          if (!pSeen.has(ph.asset_id)) {
            const holdings = holdingsMap2[ph.asset_id] ?? 0
            const fx = lastFxMap2[ph.asset_id] ?? 1
            priceMap[ph.asset_id] = ph.price * holdings * fx
            pSeen.add(ph.asset_id)
          }
        }

        const lines = assets.map(a => {
          const id = a.id as number
          const cls = (a.asset_classes as unknown as { name: string } | null)?.name ?? 'No class'
          const invested = investedMap[id] ?? 0
          const current = priceMap[id] ?? manualMap[id]
          return `${a.code} (${a.name}) | ${cls} | ${a.asset_type} | invested: R$${invested.toFixed(0)}${current != null ? ` | current: R$${current.toFixed(0)}` : ''}`
        })
        return `Portfolio (${assets.length} assets):\n${lines.join('\n')}`
      }

      case 'get_spending_by_category': {
        const inp = input as { months?: number; year?: number; month?: number }
        let fromDate: string, toDate: string
        if (inp.year && inp.month) {
          fromDate = `${inp.year}-${String(inp.month).padStart(2, '0')}-01`
          toDate   = new Date(inp.year, inp.month, 0).toISOString().split('T')[0]
        } else {
          const d = new Date()
          d.setMonth(d.getMonth() - (inp.months ?? 3))
          fromDate = d.toISOString().split('T')[0]
          toDate   = new Date().toISOString().split('T')[0]
        }
        const { data: txns } = await supabaseAdmin
          .from('finance_transactions')
          .select('amount, currency, finance_categories(name, finance_envelopes(name))')
          .eq('user_id', userId).lt('amount', 0).eq('exclude_from_stats', false)
          .gte('date', fromDate).lte('date', toDate)

        const byCategory: Record<string, { total: number; envelope: string; currency: string }> = {}
        for (const t of txns ?? []) {
          const cat = (t.finance_categories as unknown as { name: string; finance_envelopes: { name: string } } | null)
          const catName = cat?.name ?? 'Uncategorized'
          const envName = cat?.finance_envelopes?.name ?? ''
          if (!byCategory[catName]) byCategory[catName] = { total: 0, envelope: envName, currency: t.currency ?? '' }
          byCategory[catName].total += Math.abs(t.amount ?? 0)
        }
        const sorted = Object.entries(byCategory)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([n, d]) => `${n} (${d.envelope}): ${d.total.toFixed(2)} ${d.currency}`)
        return `Expenses by category (${fromDate} to ${toDate})\n${sorted.join('\n')}`
      }

      case 'get_transactions': {
        const inp = input as { limit?: number; from_date?: string; to_date?: string; type?: string; search?: string }
        const rowLimit = inp.search ? 200 : (inp.limit ?? 20)
        let q = supabaseAdmin
          .from('finance_transactions')
          .select('date, description, amount, currency, finance_categories(name), finance_accounts(name)')
          .eq('user_id', userId).order('date', { ascending: false }).limit(rowLimit)
        if (inp.from_date) q = q.gte('date', inp.from_date)
        if (inp.to_date)   q = q.lte('date', inp.to_date)
        if (inp.type === 'expense') q = q.lt('amount', 0)
        else if (inp.type === 'income') q = q.gt('amount', 0)
        if (inp.search)    q = q.ilike('description', `%${inp.search}%`)
        const { data: txns } = await q
        if (!txns?.length) return 'No transactions found.'
        const lines = txns.map(t => {
          const cat = (t.finance_categories as unknown as { name: string } | null)?.name ?? '—'
          const acc = (t.finance_accounts as unknown as { name: string } | null)?.name ?? '—'
          const dir = (t.amount ?? 0) < 0 ? '↓' : '↑'
          return `${t.date} | ${dir} ${Math.abs(t.amount ?? 0).toFixed(2)} ${t.currency} | ${t.description} | ${cat} | ${acc}`
        })
        return `Transactions (${txns.length}):\n${lines.join('\n')}`
      }

      case 'get_merchant_spending': {
        const inp = input as { merchant: string; from_date?: string; to_date?: string }
        const base = inp.merchant.trim()

        // Build candidates: full phrase + each significant word (≥ 3 chars), deduped
        const words = base.split(/[\s\-_\/]+/).filter(w => w.length >= 3)
        const candidates = Array.from(new Set([base, ...words])).filter(c => c.length >= 3)

        type TxRow = { date: string; description: string; amount: number | null; currency: string }
        let txns: TxRow[] | null = null
        let matchedTerm = base

        for (const term of candidates) {
          let q = supabaseAdmin
            .from('finance_transactions')
            .select('date, description, amount, currency')
            .eq('user_id', userId).ilike('description', `%${term}%`)
            .order('date', { ascending: true }).limit(500)
          if (inp.from_date) q = q.gte('date', inp.from_date)
          if (inp.to_date)   q = q.lte('date', inp.to_date)
          const { data } = await q
          if (data && data.length > 0) { txns = data as TxRow[]; matchedTerm = term; break }
        }

        if (!txns?.length) {
          return `No transactions found matching "${base}" (tried: ${candidates.join(', ')}). Use list_merchants to browse actual merchant names in the statement.`
        }

        const fuzzyNote = matchedTerm !== base ? ` (matched on "${matchedTerm}")` : ''
        const expenses = txns.filter(t => (t.amount ?? 0) < 0)
        const incomes  = txns.filter(t => (t.amount ?? 0) > 0)
        const totalExpense = expenses.reduce((s, t) => s + Math.abs(t.amount ?? 0), 0)
        const totalIncome  = incomes.reduce((s, t) => s + (t.amount ?? 0), 0)
        const currency = txns[0]?.currency ?? ''
        const lines = txns.map(t =>
          `${t.date} | ${(t.amount ?? 0) < 0 ? '↓' : '↑'} ${Math.abs(t.amount ?? 0).toFixed(2)} ${t.currency} | ${t.description}`
        )
        return [
          `"${base}"${fuzzyNote} — ${txns.length} transaction(s) | ${txns[0].date} → ${txns[txns.length - 1].date}`,
          expenses.length > 0 ? `Total expenses: ${totalExpense.toFixed(2)} ${currency} (${expenses.length})` : '',
          incomes.length  > 0 ? `Total income: ${totalIncome.toFixed(2)} ${currency} (${incomes.length})` : '',
          '',
          ...lines,
        ].filter(Boolean).join('\n')
      }

      case 'list_merchants': {
        const inp = input as { limit?: number; type?: string; search?: string }
        let q = supabaseAdmin
          .from('finance_transactions')
          .select('description, amount, currency')
          .eq('user_id', userId).not('description', 'is', null).limit(3000)
        if (inp.type === 'expense') q = q.lt('amount', 0)
        else if (inp.type === 'income') q = q.gt('amount', 0)
        if (inp.search) q = q.ilike('description', `%${inp.search}%`)
        const { data: rows } = await q
        if (!rows?.length) return 'No transactions found.'
        const freq = new Map<string, { count: number; total: number; currency: string }>()
        for (const r of rows) {
          const key = (r.description as string).split(/\s+/).slice(0, 3).join(' ').toUpperCase()
          const cur = freq.get(key) ?? { count: 0, total: 0, currency: r.currency ?? '' }
          freq.set(key, { count: cur.count + 1, total: cur.total + Math.abs(r.amount ?? 0), currency: cur.currency })
        }
        const sorted = [...freq.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, inp.limit ?? 40)
          .map(([name, d]) => `${name} (${d.count}x, ${d.total.toFixed(0)} ${d.currency})`)
        return `Top merchants:\n${sorted.join('\n')}`
      }

      case 'get_financial_summary': {
        const months = (input.months as number) ?? 6
        const d = new Date(); d.setMonth(d.getMonth() - months)
        const { data: txns } = await supabaseAdmin
          .from('finance_transactions')
          .select('date, amount, currency')
          .eq('user_id', userId).eq('exclude_from_stats', false)
          .gte('date', d.toISOString().split('T')[0])
        const byMonth: Record<string, { income: number; expense: number; currency: string }> = {}
        for (const t of txns ?? []) {
          const m = t.date.slice(0, 7)
          if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0, currency: t.currency ?? '' }
          if ((t.amount ?? 0) > 0) byMonth[m].income += t.amount ?? 0
          else byMonth[m].expense += Math.abs(t.amount ?? 0)
        }
        const lines = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]))
          .map(([m, v]) => `${m}: income ${v.income.toFixed(0)} | expense ${v.expense.toFixed(0)} | balance ${(v.income - v.expense).toFixed(0)} ${v.currency}`)
        return `Monthly summary (last ${months} months):\n${lines.join('\n')}`
      }

      case 'get_period_performance': {
        const period = input.period as string
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

        let fromDate: string
        if (period === 'last_7d') {
          const d = new Date(now); d.setDate(d.getDate() - 7)
          fromDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        } else if (period === 'this_month') {
          fromDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
        } else if (period === 'last_30d') {
          const d = new Date(now); d.setDate(d.getDate() - 30)
          fromDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        } else if (period === 'ytd') {
          fromDate = `${now.getFullYear()}-01-01`
        } else {
          const d = new Date(now); d.setFullYear(d.getFullYear() - 1)
          fromDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        }

        const { data: assets } = await supabaseAdmin
          .from('assets')
          .select('id, code, name, asset_type, asset_classes(name)')
          .eq('user_id', userId)
          .eq('active', true)
          .eq('asset_type', 'ticker')

        if (!assets?.length) return 'No ticker assets found.'
        const ids = assets.map(a => a.id as number)

        const [{ data: endPrices }, { data: startPrices }, { data: allContribs }] = await Promise.all([
          supabaseAdmin.from('price_history')
            .select('asset_id, price, ref_date, currency')
            .in('asset_id', ids).lte('ref_date', today)
            .order('ref_date', { ascending: false }).limit(ids.length * 5),
          supabaseAdmin.from('price_history')
            .select('asset_id, price, ref_date, currency')
            .in('asset_id', ids).lt('ref_date', fromDate)
            .order('ref_date', { ascending: false }).limit(ids.length * 5),
          supabaseAdmin.from('contributions')
            .select('asset_id, date, type, quantity, value_brl, fx_rate_brl')
            .in('asset_id', ids).order('date', { ascending: true }),
        ])

        if (!endPrices?.length) return 'No price history found. Run a portfolio sync first.'

        const endPriceMap: Record<number, { price: number }> = {}
        for (const p of endPrices ?? []) {
          if (!(p.asset_id in endPriceMap)) endPriceMap[p.asset_id] = { price: p.price }
        }
        const startPriceMap: Record<number, { price: number }> = {}
        for (const p of startPrices ?? []) {
          if (!(p.asset_id in startPriceMap)) startPriceMap[p.asset_id] = { price: p.price }
        }

        const holdingsNow: Record<number, number> = {}
        const holdingsAtStart: Record<number, number> = {}
        const lastFxPerf: Record<number, number> = {}
        const cashInPeriod: Record<number, number> = {}

        for (const c of allContribs ?? []) {
          const id = c.asset_id as number
          const qty = (c.quantity ?? 0) * (c.type === 'sell' ? -1 : 1)
          if (c.date < fromDate) holdingsAtStart[id] = (holdingsAtStart[id] ?? 0) + qty
          holdingsNow[id] = (holdingsNow[id] ?? 0) + qty
          if (c.fx_rate_brl) lastFxPerf[id] = c.fx_rate_brl
          if (c.date >= fromDate && c.date <= today) {
            const brl = (c.value_brl ?? 0) * (c.type === 'sell' ? -1 : 1)
            cashInPeriod[id] = (cashInPeriod[id] ?? 0) + brl
          }
        }

        type PerfRow = {
          code: string; name: string; cls: string
          valueStart: number; valueEnd: number
          contributions: number; changeBrl: number; changePct: number | null
        }

        const rows: PerfRow[] = []
        for (const asset of assets) {
          const id = asset.id as number
          const ep = endPriceMap[id]
          if (!ep) continue

          const fx = lastFxPerf[id] ?? 1
          const holdEnd = holdingsNow[id] ?? 0
          const holdStart = holdingsAtStart[id] ?? holdEnd
          const sp = startPriceMap[id]
          const valueEnd   = ep.price * holdEnd   * fx
          const valueStart = sp ? sp.price * holdStart * fx : 0
          const contributions = cashInPeriod[id] ?? 0
          const changeBrl = valueEnd - valueStart - contributions
          const dietzBase = valueStart + 0.5 * contributions
          const changePct = dietzBase > 0 ? (changeBrl / dietzBase) * 100 : null

          rows.push({
            code: asset.code,
            name: asset.name,
            cls: (asset.asset_classes as unknown as { name: string } | null)?.name ?? 'No class',
            valueStart, valueEnd, contributions, changeBrl, changePct,
          })
        }

        if (rows.length === 0) return 'No price history available for this period. Run a portfolio sync first.'

        rows.sort((a, b) => a.changeBrl - b.changeBrl)

        const periodLabel: Record<string, string> = {
          last_7d:    `last 7 days (from ${fromDate})`,
          this_month: `this month (from ${fromDate})`,
          last_30d:   `last 30 days (from ${fromDate})`,
          ytd:        `year to date (from ${fromDate})`,
          last_12m:   `last 12 months (from ${fromDate})`,
        }

        const lines = rows.map(r => {
          const sign = r.changeBrl >= 0 ? '+' : ''
          const pctStr = r.changePct != null ? ` (${sign}${r.changePct.toFixed(1)}%)` : ''
          return `${r.code} (${r.name}) | ${r.cls} | start: R$${r.valueStart.toFixed(0)} → now: R$${r.valueEnd.toFixed(0)} | change: ${sign}R$${r.changeBrl.toFixed(0)}${pctStr}${r.contributions !== 0 ? ` | net new capital: R$${r.contributions.toFixed(0)}` : ''}`
        })

        const totalChange = rows.reduce((s, r) => s + r.changeBrl, 0)
        const losers  = rows.filter(r => r.changeBrl < 0)
        const gainers = rows.filter(r => r.changeBrl > 0)

        return [
          `Portfolio performance — ${periodLabel[period] ?? period}`,
          `Total change: ${totalChange >= 0 ? '+' : ''}R$${totalChange.toFixed(0)}`,
          `Assets tracked: ${rows.length} | Losers: ${losers.length} | Gainers: ${gainers.length}`,
          '',
          '--- Ranked worst to best ---',
          ...lines,
        ].join('\n')
      }

      case 'get_dividends': {
        const inp = input as { from_date?: string; to_date?: string; asset_code?: string }
        const { data: assets } = await supabaseAdmin
          .from('assets').select('id, code, name').eq('user_id', userId).eq('active', true)
        let ids = (assets ?? []).map(a => a.id as number)
        if (inp.asset_code) {
          const q = inp.asset_code.toLowerCase()
          ids = ids.filter(id => {
            const a = assets?.find(x => x.id === id)
            return a && (a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
          })
        }
        if (!ids.length) return 'No assets found.'
        let q = supabaseAdmin.from('dividends')
          .select('asset_id, ex_date, pay_date, amount_brl, amount_total, currency, dividend_type')
          .in('asset_id', ids).eq('user_id', userId).order('ex_date', { ascending: false }).limit(200)
        if (inp.from_date) q = q.gte('ex_date', inp.from_date)
        if (inp.to_date)   q = q.lte('ex_date', inp.to_date)
        const { data: divs } = await q
        if (!divs?.length) return 'No dividends found for the given filters.'
        const assetMap = Object.fromEntries((assets ?? []).map(a => [a.id, a]))
        const totalBrl = divs.reduce((s, d) => s + (d.amount_brl ?? 0), 0)
        const lines = divs.map(d => {
          const a = assetMap[d.asset_id]
          return `${d.ex_date} | ${a?.code ?? d.asset_id} | ${d.dividend_type ?? 'dividend'} | R$${(d.amount_brl ?? 0).toFixed(2)}${d.currency !== 'BRL' ? ` (${d.amount_total?.toFixed(4)} ${d.currency})` : ''}`
        })
        return [`Dividends/income (${divs.length}): Total R$${totalBrl.toFixed(2)}`, ...lines].join('\n')
      }

      case 'get_tax_report': {
        const year = (input.year as number) ?? new Date().getFullYear()
        const fromDate = `${year}-01-01`
        const toDate   = `${year}-12-31`
        const { data: assets } = await supabaseAdmin
          .from('assets').select('id, code, name, asset_type, asset_classes(name)')
          .eq('user_id', userId)
        if (!assets?.length) return 'No assets found.'
        const ids = assets.map(a => a.id as number)
        const assetMap = Object.fromEntries(assets.map(a => [a.id as number, a]))

        const [{ data: divs }, { data: sells }, { data: allBuys }, { data: yearEndHist }] = await Promise.all([
          supabaseAdmin.from('dividends').select('asset_id, ex_date, amount_brl, dividend_type')
            .in('asset_id', ids).eq('user_id', userId).gte('ex_date', fromDate).lte('ex_date', toDate),
          supabaseAdmin.from('contributions').select('asset_id, date, quantity, value_brl')
            .in('asset_id', ids).eq('type', 'sell').gte('date', fromDate).lte('date', toDate),
          supabaseAdmin.from('contributions').select('asset_id, date, quantity, value_brl')
            .in('asset_id', ids).eq('type', 'buy').lte('date', toDate),
          supabaseAdmin.from('price_history').select('asset_id, ref_date, price, currency')
            .in('asset_id', ids).lte('ref_date', toDate).order('ref_date', { ascending: false }).limit(ids.length * 5),
        ])

        const divByType: Record<string, number> = {}
        let totalDivBrl = 0
        for (const d of divs ?? []) {
          const type = d.dividend_type ?? 'dividend'
          divByType[type] = (divByType[type] ?? 0) + (d.amount_brl ?? 0)
          totalDivBrl += d.amount_brl ?? 0
        }

        const gainLines: string[] = []
        for (const id of ids) {
          const assetSells = (sells ?? []).filter(s => s.asset_id === id)
          if (!assetSells.length) continue
          const buys = (allBuys ?? []).filter(b => b.asset_id === id)
          const totalBuyQty = buys.reduce((s, b) => s + (b.quantity ?? 0), 0)
          const totalBuyVal = buys.reduce((s, b) => s + (b.value_brl ?? 0), 0)
          const avgCost = totalBuyQty > 0 ? totalBuyVal / totalBuyQty : 0
          const totalSellQty = assetSells.reduce((s, b) => s + (b.quantity ?? 0), 0)
          const totalSellVal = assetSells.reduce((s, b) => s + (b.value_brl ?? 0), 0)
          const costBasis = avgCost * totalSellQty
          const gain = totalSellVal - costBasis
          const a = assetMap[id]
          gainLines.push(`  ${a?.code ?? id} (${a?.name ?? ''}): sold R$${totalSellVal.toFixed(0)} | avg cost basis R$${costBasis.toFixed(0)} | gain/loss: ${gain >= 0 ? '+' : ''}R$${gain.toFixed(0)}`)
        }

        const seenYE = new Set<number>()
        const posLines: string[] = []
        for (const ph of yearEndHist ?? []) {
          if (seenYE.has(ph.asset_id)) continue
          seenYE.add(ph.asset_id)
          const a = assetMap[ph.asset_id]
          if (a) posLines.push(`  ${a.code} (${a.name}): ${ph.price.toFixed(4)} ${ph.currency} (date: ${ph.ref_date})`)
        }

        return [
          `=== IR / TAX REPORT — ${year} ===`,
          '',
          `DIVIDENDS & INCOME — Total: R$${totalDivBrl.toFixed(2)}`,
          ...(Object.keys(divByType).length
            ? Object.entries(divByType).map(([t, v]) => `  ${t}: R$${v.toFixed(2)}`)
            : ['  None recorded']),
          '',
          `CAPITAL GAINS (avg-cost method, simplified):`,
          ...(gainLines.length ? gainLines : ['  No sell transactions in this year']),
          '',
          `YEAR-END POSITIONS (${year}-12-31 or closest prior date):`,
          ...(posLines.length ? posLines : ['  No price history available — run a sync']),
        ].join('\n')
      }

      case 'get_accounts': {
        const { data: accounts } = await supabaseAdmin
          .from('finance_accounts')
          .select('name, currency, current_balance, institution_name')
          .eq('user_id', userId).eq('active', true)
        if (!accounts?.length) return 'No accounts found.'
        const lines = accounts.map(a =>
          `${a.name}${a.institution_name ? ` (${a.institution_name})` : ''} | ${a.currency} | balance: ${a.current_balance ?? 0}`
        )
        return `Accounts (${accounts.length}):\n${lines.join('\n')}`
      }

      case 'list_trips': {
        const inp = input as { search?: string }
        const [{ data: ownedTrips }, { data: memberRows }] = await Promise.all([
          supabaseAdmin.from('voyage_trips').select('*').eq('user_id', userId),
          supabaseAdmin.from('voyage_trip_members').select('trip_id').eq('user_id', userId).eq('status', 'active'),
        ])
        const memberTripIds = (memberRows ?? []).map(m => m.trip_id)
        let memberTrips: any[] = []
        if (memberTripIds.length > 0) {
          const { data } = await supabaseAdmin.from('voyage_trips').select('*').in('id', memberTripIds).not('user_id', 'eq', userId)
          memberTrips = data ?? []
        }
        const seen = new Set<number>()
        let trips = [...(ownedTrips ?? []), ...memberTrips].filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true })

        if (inp.search?.trim()) {
          const q = inp.search.trim().toLowerCase()
          trips = trips.filter(t => t.title?.toLowerCase().includes(q) || t.destination?.toLowerCase().includes(q))
        }
        if (!trips.length) return 'No trips found.'

        const tripIds = trips.map(t => t.id)
        const [{ data: dests }, { data: places }] = await Promise.all([
          supabaseAdmin.from('voyage_trip_destinations').select('trip_id, city, country, day_start, day_end').in('trip_id', tripIds).order('sort_order'),
          supabaseAdmin.from('voyage_trip_places').select('trip_id').in('trip_id', tripIds),
        ])
        const destsByTrip: Record<number, any[]> = {}
        for (const d of dests ?? []) (destsByTrip[d.trip_id] ??= []).push(d)
        const placeCountByTrip: Record<number, number> = {}
        for (const p of places ?? []) placeCountByTrip[p.trip_id] = (placeCountByTrip[p.trip_id] ?? 0) + 1

        const lines = trips.map(t => {
          const ds = destsByTrip[t.id] ?? []
          const destStr = ds.length
            ? ds.map(d => `${d.city ?? '?'}${d.day_start != null ? ` (day ${d.day_start}-${d.day_end ?? d.day_start})` : ''}`).join(' → ')
            : (t.destination ?? 'no destination set')
          return `trip_id ${t.id}: "${t.title}" | ${destStr} | ${t.start_date ?? '?'} to ${t.end_date ?? '?'} | status: ${t.status} | ${placeCountByTrip[t.id] ?? 0} places`
        })
        return `Trips (${trips.length}):\n${lines.join('\n')}`
      }

      case 'get_trip_itinerary': {
        const inp = input as { trip_id: number; day_number?: number }
        const tripId = Number(inp.trip_id)
        if (!tripId) return 'trip_id is required.'

        const access = await hasVoyageTripAccess(tripId, userId)
        if (!access) return `Trip ${tripId} not found or you don't have access to it.`

        let q = supabaseAdmin
          .from('voyage_trip_places').select('id, name, category, address, lat, lng, day_number, sort_order, destination_id, trip_note, is_highlight, visited')
          .eq('trip_id', tripId)
          .order('day_number', { ascending: true, nullsFirst: false })
          .order('sort_order')
        if (inp.day_number != null) q = q.eq('day_number', inp.day_number)
        const { data: places } = await q
        if (!places?.length) return `Trip ${tripId} has no places${inp.day_number != null ? ` on day ${inp.day_number}` : ''}.`

        const { data: dests } = await supabaseAdmin
          .from('voyage_trip_destinations').select('id, city, country, day_start, day_end').eq('trip_id', tripId).order('sort_order')
        const destMap: Record<number, any> = {}
        for (const d of dests ?? []) destMap[d.id] = d

        const lines = places.map(p => {
          const dest = p.destination_id != null ? destMap[p.destination_id] : null
          return [
            `place_id ${p.id}: ${p.name}`,
            `  day: ${p.day_number ?? 'unscheduled'}${dest ? ` | destination: ${dest.city}` : ''} | category: ${p.category ?? 'n/a'}`,
            p.address ? `  address: ${p.address}` : '',
            p.lat != null && p.lng != null ? `  coordinates: ${p.lat}, ${p.lng}` : '  coordinates: not geocoded',
            p.trip_note ? `  note: ${p.trip_note}` : '',
            p.is_highlight ? '  ⭐ highlight' : '',
          ].filter(Boolean).join('\n')
        })
        return `Itinerary for trip ${tripId} (${places.length} places):\n\n${lines.join('\n\n')}`
      }

      case 'calculate_route_distance': {
        const inp = input as { place_ids: number[] }
        const ids = (inp.place_ids ?? []).map(Number).filter(n => !Number.isNaN(n))
        if (ids.length < 2) return 'Need at least 2 place_ids to calculate a route.'

        const { data: places } = await supabaseAdmin
          .from('voyage_trip_places').select('id, name, lat, lng, trip_id').in('id', ids)
        if (!places?.length) return 'No matching places found for the given place_ids.'

        const tripIds = [...new Set(places.map(p => p.trip_id))]
        for (const tId of tripIds) {
          if (!(await hasVoyageTripAccess(tId, userId))) return `You don't have access to trip ${tId}.`
        }

        const byId: Record<number, any> = {}
        for (const p of places) byId[p.id] = p

        const legs: string[] = []
        let total = 0
        let missing = 0
        for (let i = 0; i < ids.length - 1; i++) {
          const a = byId[ids[i]]
          const b = byId[ids[i + 1]]
          if (!a || !b) { legs.push(`(unknown place in sequence)`); continue }
          if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
            legs.push(`${a.name} → ${b.name}: not geocoded, cannot compute`)
            missing++
            continue
          }
          const km = haversineKm(a.lat, a.lng, b.lat, b.lng)
          total += km
          legs.push(`${a.name} → ${b.name}: ${km.toFixed(1)} km`)
        }
        return [
          `Route (${ids.length} stops, straight-line distance):`,
          ...legs,
          `Total: ${total.toFixed(1)} km${missing > 0 ? ` (${missing} leg(s) skipped — missing coordinates)` : ''}`,
          'Note: this is straight-line distance, not driving distance — actual road distance will be longer.',
        ].join('\n')
      }

      case 'get_trip_cost': {
        const inp = input as { trip_id: number }
        const tripId = Number(inp.trip_id)
        if (!tripId) return 'trip_id is required.'
        if (!(await hasVoyageTripAccess(tripId, userId))) return `Trip ${tripId} not found or you don't have access to it.`

        const cost = await buildCostSummary(tripId, userId)
        if (!cost.moments.length) return `Trip ${tripId}: no moments linked yet, no cost data available.`

        const lines = [
          `Trip ${tripId} cost: ${cost.total.toFixed(2)} ${cost.currency}${cost.budget != null ? ` / budget ${cost.budget.toFixed(2)} ${cost.currency}` : ''}`,
        ]
        if (cost.by_category?.length) {
          lines.push('By category:')
          for (const c of cost.by_category) lines.push(`  ${c.name}: ${c.total.toFixed(2)} ${cost.currency}`)
        }
        if (cost.by_place?.length) {
          lines.push('By place:')
          for (const p of cost.by_place) lines.push(`  ${p.name}: ${p.total.toFixed(2)} ${cost.currency}`)
        }
        if (cost.by_user?.length > 1) {
          lines.push('By person:')
          for (const u of cost.by_user) lines.push(`  ${u.display?.name ?? u.user_id}: ${u.total.toFixed(2)} ${cost.currency}`)
        }
        return lines.join('\n')
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`
  }
}

// ─── Session CRUD ──────────────────────────────────────────────────────────────

router.get('/sessions', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data } = await supabaseAdmin
    .from('ai_chat_sessions')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)
  res.json(data ?? [])
})

router.post('/sessions', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { title } = req.body as { title?: string }
  const { data } = await supabaseAdmin
    .from('ai_chat_sessions')
    .insert({ user_id: userId, title: (title ?? 'Nova conversa').slice(0, 80) })
    .select('id, title, updated_at')
    .single()
  res.json(data)
})

router.patch('/sessions/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { title } = req.body as { title: string }
  await supabaseAdmin
    .from('ai_chat_sessions')
    .update({ title: (title ?? '').slice(0, 80), updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', userId)
  res.json({ ok: true })
})

router.delete('/sessions/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  await supabaseAdmin
    .from('ai_chat_sessions')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId)
  res.json({ ok: true })
})

router.get('/sessions/:id/messages', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data: session } = await supabaseAdmin
    .from('ai_chat_sessions')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single()
  if (!session) { res.status(404).json({ error: 'Session not found' }); return }
  const { data: msgs } = await supabaseAdmin
    .from('ai_chat_messages')
    .select('role, content')
    .eq('session_id', req.params.id)
    .order('created_at', { ascending: true })
  res.json(msgs ?? [])
})

// ─── Chat inference ─────────────────────────────────────────────────────────────

// POST /api/chat
router.post('/', requireAuth, async (req, res: Response) => {
  const { userId, userLocale } = req as AuthRequest
  const { messages, currentPath, session_id: incomingSessionId } = req.body as {
    messages: Anthropic.MessageParam[]
    currentPath?: string
    session_id?: string | null
  }

  if (!messages?.length) { res.status(400).json({ error: 'messages required' }); return }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' }); return }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  // Resolve or create a session for persistence
  let sessionId: string | null = incomingSessionId ?? null
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  const userText = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : ''

  if (!sessionId && userText) {
    const title = userText.slice(0, 80)
    const { data: newSession } = await supabaseAdmin
      .from('ai_chat_sessions')
      .insert({ user_id: userId, title })
      .select('id')
      .single()
    sessionId = newSession?.id ?? null
  }

  if (sessionId) send({ type: 'session', session_id: sessionId })

  const today = new Date().toISOString().split('T')[0]
  const systemPrompt = buildSystemPrompt({
    locale: userLocale,
    currentPath: currentPath ?? 'unknown',
    today,
  })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const runMessages: Anthropic.MessageParam[] = [...messages]
  let fullAssistantText = ''

  try {
    for (let iter = 0; iter < 6; iter++) {
      const stream = anthropic.messages.stream({
        model:      'claude-sonnet-4-6',
        max_tokens: 2048,
        system:     systemPrompt,
        tools:      TOOLS,
        messages:   runMessages,
      })

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && event.delta.text) {
          fullAssistantText += event.delta.text
          send({ type: 'delta', text: event.delta.text })
        }
        if (event.type === 'content_block_start' && (event.content_block as { type: string }).type === 'server_tool_use') {
          send({ type: 'tool_call', tool: 'web_search' })
        }
      }

      const final = await stream.finalMessage()

      if (final.stop_reason === 'tool_use') {
        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const block of final.content) {
          if (block.type === 'tool_use') {
            send({ type: 'tool_call', tool: block.name })
            const result = await executeTool(block.name, block.input as Record<string, unknown>, userId)
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
          }
        }
        runMessages.push({ role: 'assistant', content: final.content })
        runMessages.push({ role: 'user', content: toolResults })
        continue
      }

      break
    }

    // Persist the user message + assistant response
    if (sessionId && userText && fullAssistantText) {
      await supabaseAdmin.from('ai_chat_messages').insert([
        { session_id: sessionId, role: 'user',      content: userText },
        { session_id: sessionId, role: 'assistant', content: fullAssistantText },
      ])
      await supabaseAdmin
        .from('ai_chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId)
    }
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' })
  }

  send({ type: 'done' })
  res.end()
})

export default router
