import { Router, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'

const router = Router()

function buildSystemPrompt(opts: { locale: string; currentPath: string; today: string }): string {
  const lang = opts.locale === 'fr' ? 'French' : opts.locale === 'en' ? 'English' : 'Brazilian Portuguese'
  return `You are a helpful assistant built into a personal finance and investment portfolio tracker app. Your role is strictly limited to two things: (1) helping users navigate and use the app, and (2) answering questions about the user's own data using the available tools.

## Session context
- Today's date: ${opts.today}
- User's language: ${lang} — respond ONLY in this language, regardless of what language the system prompt is written in.
- Current page the user is on: ${opts.currentPath}

## CRITICAL: Data accuracy rule
NEVER invent, guess, or assume the user's financial data. For any question about portfolio, transactions, accounts, or spending, you MUST call the appropriate tool first. If a tool returns empty results, say so honestly — do not make up numbers.

When the user mentions an asset by partial name or code (e.g. "minha Petrobras", "PETR", "conta Nubank", "meu bitcoin"), call search_asset with the partial name before answering. When user asks about a merchant or company spending (e.g. "quanto gastei no Carrefour", "todas as cobranças da Prixtel"), call get_merchant_spending; if it returns nothing, call list_merchants to find the actual name used in the statement.

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
- Show the user their data: portfolio, spending, transactions, accounts (use the tools)
- Explain how any feature in the app works
- Guide navigation step by step
- Clarify what numbers mean in the app context

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

const TOOLS: Anthropic.Tool[] = [
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
]

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
          supabaseAdmin.from('contributions').select('asset_id, type, value_brl').in('asset_id', ids),
          supabaseAdmin.from('manual_values').select('asset_id, value').in('asset_id', ids).order('ref_date', { ascending: false }),
          supabaseAdmin.from('price_history').select('asset_id, total_brl').in('asset_id', ids).order('date', { ascending: false }).limit(ids.length * 3),
        ])

        const investedMap: Record<number, number> = {}
        for (const c of contribs ?? []) {
          const delta = c.type === 'sell' ? -(c.value_brl ?? 0) : (c.value_brl ?? 0)
          investedMap[c.asset_id] = (investedMap[c.asset_id] ?? 0) + delta
        }
        const manualMap: Record<number, number> = {}
        const mSeen = new Set<number>()
        for (const mv of manualVals ?? []) {
          if (!mSeen.has(mv.asset_id)) { manualMap[mv.asset_id] = mv.value; mSeen.add(mv.asset_id) }
        }
        const priceMap: Record<number, number> = {}
        const pSeen = new Set<number>()
        for (const ph of priceHist ?? []) {
          if (!pSeen.has(ph.asset_id)) { priceMap[ph.asset_id] = ph.total_brl; pSeen.add(ph.asset_id) }
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
          supabaseAdmin.from('contributions').select('asset_id, type, value_brl').in('asset_id', ids),
          supabaseAdmin.from('manual_values').select('asset_id, value').in('asset_id', ids).order('ref_date', { ascending: false }),
          supabaseAdmin.from('price_history').select('asset_id, total_brl').in('asset_id', ids).order('date', { ascending: false }).limit(ids.length * 3),
        ])

        const investedMap: Record<number, number> = {}
        for (const c of contribs ?? []) {
          const delta = c.type === 'sell' ? -(c.value_brl ?? 0) : (c.value_brl ?? 0)
          investedMap[c.asset_id] = (investedMap[c.asset_id] ?? 0) + delta
        }
        const manualMap: Record<number, number> = {}
        const mSeen = new Set<number>()
        for (const mv of manualVals ?? []) {
          if (!mSeen.has(mv.asset_id)) { manualMap[mv.asset_id] = mv.value; mSeen.add(mv.asset_id) }
        }
        const priceMap: Record<number, number> = {}
        const pSeen = new Set<number>()
        for (const ph of priceHist ?? []) {
          if (!pSeen.has(ph.asset_id)) { priceMap[ph.asset_id] = ph.total_brl; pSeen.add(ph.asset_id) }
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
          .select('amount_brl, finance_categories(name, finance_envelopes(name))')
          .eq('user_id', userId).eq('type', 'expense').eq('exclude_from_stats', false)
          .gte('date', fromDate).lte('date', toDate)

        const byCategory: Record<string, { total: number; envelope: string }> = {}
        for (const t of txns ?? []) {
          const cat = (t.finance_categories as unknown as { name: string; finance_envelopes: { name: string } } | null)
          const catName = cat?.name ?? 'Uncategorized'
          const envName = cat?.finance_envelopes?.name ?? ''
          if (!byCategory[catName]) byCategory[catName] = { total: 0, envelope: envName }
          byCategory[catName].total += t.amount_brl ?? 0
        }
        const total = Object.values(byCategory).reduce((s, v) => s + v.total, 0)
        const sorted = Object.entries(byCategory)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([n, d]) => `${n} (${d.envelope}): R$${d.total.toFixed(0)}`)
        return `Expenses by category (${fromDate} to ${toDate})\nTotal: R$${total.toFixed(0)}\n${sorted.join('\n')}`
      }

      case 'get_transactions': {
        const inp = input as { limit?: number; from_date?: string; to_date?: string; type?: string; search?: string }
        const rowLimit = inp.search ? 200 : (inp.limit ?? 20)
        let q = supabaseAdmin
          .from('finance_transactions')
          .select('date, description, amount_brl, type, finance_categories(name), finance_accounts(name)')
          .eq('user_id', userId).order('date', { ascending: false }).limit(rowLimit)
        if (inp.from_date) q = q.gte('date', inp.from_date)
        if (inp.to_date)   q = q.lte('date', inp.to_date)
        if (inp.type)      q = q.eq('type', inp.type)
        if (inp.search)    q = q.ilike('description', `%${inp.search}%`)
        const { data: txns } = await q
        if (!txns?.length) return 'No transactions found.'
        const lines = txns.map(t => {
          const cat = (t.finance_categories as unknown as { name: string } | null)?.name ?? '—'
          const acc = (t.finance_accounts as unknown as { name: string } | null)?.name ?? '—'
          return `${t.date} | ${t.type === 'expense' ? '↓' : '↑'} R$${(t.amount_brl ?? 0).toFixed(0)} | ${t.description} | ${cat} | ${acc}`
        })
        return `Transactions (${txns.length}):\n${lines.join('\n')}`
      }

      case 'get_merchant_spending': {
        const inp = input as { merchant: string; from_date?: string; to_date?: string }
        const base = inp.merchant.trim()

        // Build candidates: full phrase + each significant word (≥ 3 chars), deduped
        const words = base.split(/[\s\-_\/]+/).filter(w => w.length >= 3)
        const candidates = Array.from(new Set([base, ...words])).filter(c => c.length >= 3)

        type TxRow = { date: string; description: string; amount_brl: number | null; type: string }
        let txns: TxRow[] | null = null
        let matchedTerm = base

        for (const term of candidates) {
          let q = supabaseAdmin
            .from('finance_transactions')
            .select('date, description, amount_brl, type')
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
        const expenses = txns.filter(t => t.type === 'expense')
        const incomes  = txns.filter(t => t.type === 'income')
        const totalExpense = expenses.reduce((s, t) => s + Math.abs(t.amount_brl ?? 0), 0)
        const totalIncome  = incomes.reduce((s, t) => s + (t.amount_brl ?? 0), 0)
        const lines = txns.map(t =>
          `${t.date} | ${t.type === 'expense' ? '↓' : '↑'} R$${Math.abs(t.amount_brl ?? 0).toFixed(2)} | ${t.description}`
        )
        return [
          `"${base}"${fuzzyNote} — ${txns.length} transaction(s) | ${txns[0].date} → ${txns[txns.length - 1].date}`,
          expenses.length > 0 ? `Total expenses: R$${totalExpense.toFixed(2)} (${expenses.length})` : '',
          incomes.length  > 0 ? `Total income: R$${totalIncome.toFixed(2)} (${incomes.length})` : '',
          '',
          ...lines,
        ].filter(Boolean).join('\n')
      }

      case 'list_merchants': {
        const inp = input as { limit?: number; type?: string; search?: string }
        let q = supabaseAdmin
          .from('finance_transactions')
          .select('description, amount_brl, type')
          .eq('user_id', userId).not('description', 'is', null).limit(3000)
        if (inp.type)   q = q.eq('type', inp.type)
        if (inp.search) q = q.ilike('description', `%${inp.search}%`)
        const { data: rows } = await q
        if (!rows?.length) return 'No transactions found.'
        const freq = new Map<string, { count: number; total: number }>()
        for (const r of rows) {
          const key = (r.description as string).split(/\s+/).slice(0, 3).join(' ').toUpperCase()
          const cur = freq.get(key) ?? { count: 0, total: 0 }
          freq.set(key, { count: cur.count + 1, total: cur.total + Math.abs(r.amount_brl ?? 0) })
        }
        const sorted = [...freq.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, inp.limit ?? 40)
          .map(([name, d]) => `${name} (${d.count}x, R$${d.total.toFixed(0)})`)
        return `Top merchants:\n${sorted.join('\n')}`
      }

      case 'get_financial_summary': {
        const months = (input.months as number) ?? 6
        const d = new Date(); d.setMonth(d.getMonth() - months)
        const { data: txns } = await supabaseAdmin
          .from('finance_transactions')
          .select('date, amount_brl, type')
          .eq('user_id', userId).eq('exclude_from_stats', false)
          .gte('date', d.toISOString().split('T')[0])
        const byMonth: Record<string, { income: number; expense: number }> = {}
        for (const t of txns ?? []) {
          const m = t.date.slice(0, 7)
          if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0 }
          if (t.type === 'income') byMonth[m].income += t.amount_brl ?? 0
          else byMonth[m].expense += t.amount_brl ?? 0
        }
        const lines = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]))
          .map(([m, v]) => `${m}: income R$${v.income.toFixed(0)} | expense R$${v.expense.toFixed(0)} | balance R$${(v.income - v.expense).toFixed(0)}`)
        return `Monthly summary (last ${months} months):\n${lines.join('\n')}`
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

      default:
        return `Unknown tool: ${name}`
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`
  }
}

// POST /api/chat
router.post('/', requireAuth, async (req, res: Response) => {
  const { userId, userLocale } = req as AuthRequest
  const { messages, currentPath } = req.body as {
    messages: Anthropic.MessageParam[]
    currentPath?: string
  }

  if (!messages?.length) { res.status(400).json({ error: 'messages required' }); return }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' }); return }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  const today = new Date().toISOString().split('T')[0]
  const systemPrompt = buildSystemPrompt({
    locale: userLocale,
    currentPath: currentPath ?? 'unknown',
    today,
  })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const runMessages: Anthropic.MessageParam[] = [...messages]

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
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta' &&
          event.delta.text
        ) {
          send({ type: 'delta', text: event.delta.text })
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
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' })
  }

  send({ type: 'done' })
  res.end()
})

export default router
