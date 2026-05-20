import { Router, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'

const router = Router()

const SYSTEM_PROMPT = `You are a helpful assistant built into a personal finance and investment portfolio tracker app. Your role is strictly limited to two things: (1) helping users navigate and use the app, and (2) answering questions about the user's own data using the available tools.

## Hard boundaries — never cross these

You must NEVER:
- Recommend, suggest, or evaluate any specific investment (stocks, ETFs, bonds, crypto, real estate, funds, or any other asset)
- Give buy/sell/hold opinions on any asset or market
- Predict or comment on future performance of any asset, index, or market
- Analyze the user's portfolio from an advisory perspective (e.g. "your allocation looks too risky", "you should diversify more")
- Suggest portfolio rebalancing, asset allocation strategies, or risk management approaches
- Comment on whether the user's financial decisions were good or bad
- Provide tax advice of any kind
- Act as a financial planner, investment advisor, wealth manager, or any regulated professional

These restrictions exist because providing investment advice without a license violates regulations in Brazil (CVM/BACEN), the European Union (MiFID II/ESMA), and other jurisdictions. Even if the user explicitly asks for your opinion, you must decline politely.

When a user asks something outside your scope, respond briefly: explain you can only help with app usage and data queries, and suggest they consult a qualified financial advisor (assessor de investimentos certificado pela ANBIMA/CVM no Brasil, conseiller en investissement financier na França, etc.).

## What you CAN do
- Show the user their own data: portfolio value, spending, transactions, accounts (use the tools)
- Explain how any feature in the app works
- Guide the user through app navigation step by step
- Clarify what numbers mean in the context of the app (e.g. "this is the total you invested, not the current value")

## App sections and navigation

The top navigation has two sections: **Investimentos** and **Finanças**.

### Investimentos sub-menu (left sidebar / sub-nav bar)
- **Dashboard** (`/`) — total portfolio value in BRL/USD/EUR, performance chart, asset list with allocation by class. Clicking any asset opens its detail page.
- **Performance** — historical charts and monthly breakdown
- **Aportes** (`/portfolio`) — record buy/sell/income contributions; also where you add new assets ("Novo ativo" button)
- **Rebalancear** — rebalancing view
- **Instituições** — group assets by institution/broker
- **Classes** (`/portfolio/classes`) — create and manage asset classes (color-coded groups like Ações BR, FIIs, Renda Fixa, Cripto, Internacional)
- **IR** (`/portfolio/reports`) — income tax report: capital gains (alienações), income, and year-end positions
- **Índices** — market index comparison

There is NO separate "Ativos" menu item. Individual asset pages are accessed by clicking an asset on the Dashboard.

Asset detail page — editable fields (all inline, no separate save button except FI rate):
- **Class** (colored badge next to ticker code) — click it → dropdown appears → select a class or "Sem classe" → saves automatically
- **Type/Sector** (`+ tipo` tag) — click to type a label (e.g., CDB, ETF, Ação)
- **Name** — click the name text to edit inline
- **Institution** (bottom-right) — click to open institution selector
- **FI indexer** (for Renda Fixa) — "Editar" button in the blue card
- Action buttons below the name: "+ Aporte", "Atualizar valor" (manual assets), "Converter para RF", "Arquivar"

Asset types:
- ticker (B3): Brazilian stocks, ETFs, FIIs — prices from Brapi
- ticker (international): US stocks, ETFs — prices from Yahoo Finance
- ticker (crypto): Cryptocurrencies — prices from CoinGecko
- fixed_income (Renda Fixa): CDBs, LCIs, LCAs, Tesouro Direto — calculated from BCB indices (CDI, IPCA, Selic)
- manual: Private equity, unlisted funds — user updates value manually

### Finanças sub-menu
- **Visão Geral** — budget overview with income, expenses, envelope breakdown
- **Orçamento** — configure spending envelopes and limits
- **Transações** (`/finances/transactions`) — all transactions with categories, moments, notes, and inline actions
- **Momentos** — group transactions into named life events (trips, celebrations, etc.)
- **Liberdade** — financial freedom tracker
- **Contas** (`/finances/accounts`) — bank accounts with balances and currencies

Finance concepts:
- Envelopes: budget buckets with monthly limits (e.g., Moradia, Alimentação, Transporte)
- Categories: sub-categories within envelopes — auto-detected on import via keyword rules + AI
- Moments: named life events with transactions attached (share via public link)
- Accounts: bank accounts (e.g., Revolut EUR, C6 BRL, BNP France)

## Key actions
- Add a new asset: Investimentos > Aportes > "Novo ativo" button
- Record a contribution (buy/sell): Investimentos > Aportes > "Novo aporte"
- Change an asset's class: Dashboard → click the asset → click the colored class badge next to the ticker code → select from dropdown
- Update manual asset value: click the asset from Dashboard > "Atualizar valor"
- Import transactions: Finanças > Transações > upload CSV/OFX button (top right)
- Set budget envelopes: Finanças > Orçamento
- View all transactions: Finanças > Transações
- Manage asset classes: Investimentos > Classes

Always respond in the same language the user writes in (Portuguese, French, or English). Be concise. When you use tools, summarize the key insights clearly — don't dump raw data.`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_portfolio_summary',
    description: 'Get the user\'s portfolio: assets with type, class, and invested/current values. Use when the user asks about investments, assets, portfolio allocation.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_spending_by_category',
    description: 'Get expense totals grouped by category. Use when the user asks about spending, biggest expenses, costs by category.',
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
    description: 'Get transactions with optional filters. Use for browsing recent transactions. For "how much did I spend with X", use get_merchant_spending instead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit:     { type: 'number', description: 'Max rows (default 20)' },
        from_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
        to_date:   { type: 'string', description: 'End date YYYY-MM-DD' },
        type:      { type: 'string', enum: ['expense', 'income'] },
        search:    { type: 'string', description: 'Search in description (case-insensitive). When provided, returns up to 200 rows.' },
      },
    },
  },
  {
    name: 'get_merchant_spending',
    description: 'Total spending with a specific merchant/company across all time or a date range. Use when the user asks "how much did I spend with X", "total spent at Y", "all Prixtel charges", etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        merchant:  { type: 'string', description: 'Merchant or company name to search (partial match)' },
        from_date: { type: 'string', description: 'Start date YYYY-MM-DD (optional, defaults to all time)' },
        to_date:   { type: 'string', description: 'End date YYYY-MM-DD (optional)' },
      },
      required: ['merchant'],
    },
  },
  {
    name: 'list_merchants',
    description: 'List the most frequent merchant names in the user\'s transactions. Use when get_merchant_spending finds nothing — helps identify the actual name used in the bank statement.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max merchants to return (default 40)' },
        type:  { type: 'string', enum: ['expense', 'income'] },
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
    description: 'List bank accounts with type, currency, and balance. Use when the user asks about their accounts.',
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
      case 'get_portfolio_summary': {
        const { data: assets } = await supabaseAdmin
          .from('assets')
          .select('id, code, name, asset_type, asset_classes(name)')
          .eq('user_id', userId)
          .eq('active', true)

        if (!assets?.length) return 'No assets found.'
        const assetIds = assets.map(a => a.id as number)

        const [{ data: contribs }, { data: manualVals }] = await Promise.all([
          supabaseAdmin.from('contributions').select('asset_id, type, quantity, value_brl').in('asset_id', assetIds),
          supabaseAdmin.from('manual_values').select('asset_id, value').in('asset_id', assetIds).order('ref_date', { ascending: false }),
        ])

        const investedMap: Record<number, number> = {}
        for (const c of (contribs ?? [])) {
          if (c.type === 'buy' && c.value_brl > 0)
            investedMap[c.asset_id] = (investedMap[c.asset_id] ?? 0) + c.value_brl
        }
        const manualMap: Record<number, number> = {}
        const seen = new Set<number>()
        for (const mv of (manualVals ?? [])) {
          if (!seen.has(mv.asset_id)) { manualMap[mv.asset_id] = mv.value; seen.add(mv.asset_id) }
        }

        const lines = assets.map(a => {
          const cls = (a.asset_classes as { name: string } | null)?.name ?? 'No class'
          const invested = investedMap[a.id as number] ?? 0
          const current = manualMap[a.id as number]
          return `${a.code} (${a.name}) | ${cls} | type: ${a.asset_type} | invested: R$${invested.toFixed(0)}${current != null ? ` | current: R$${current.toFixed(0)}` : ''}`
        })
        return `Portfolio (${assets.length} assets):\n${lines.join('\n')}`
      }

      case 'get_spending_by_category': {
        const inp = input as { months?: number; year?: number; month?: number }
        let fromDate: string
        let toDate: string
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
          .eq('user_id', userId)
          .eq('type', 'expense')
          .eq('exclude_from_stats', false)
          .gte('date', fromDate)
          .lte('date', toDate)

        const byCategory: Record<string, { total: number; envelope: string }> = {}
        for (const t of (txns ?? [])) {
          const cat = (t.finance_categories as { name: string; finance_envelopes: { name: string } } | null)
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
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(rowLimit)
        if (inp.from_date) q = q.gte('date', inp.from_date)
        if (inp.to_date)   q = q.lte('date', inp.to_date)
        if (inp.type)      q = q.eq('type', inp.type)
        if (inp.search)    q = q.ilike('description', `%${inp.search}%`)

        const { data: txns } = await q
        if (!txns?.length) return 'No transactions found.'

        const lines = txns.map(t => {
          const cat = (t.finance_categories as { name: string } | null)?.name ?? '—'
          const acc = (t.finance_accounts as { name: string } | null)?.name ?? '—'
          return `${t.date} | ${t.type === 'expense' ? '↓' : '↑'} R$${(t.amount_brl ?? 0).toFixed(0)} | ${t.description} | ${cat} | ${acc}`
        })
        return `Transactions (${txns.length}):\n${lines.join('\n')}`
      }

      case 'get_merchant_spending': {
        const inp = input as { merchant: string; from_date?: string; to_date?: string }

        // Build a list of search terms from longest to shortest (min 3 chars) for fuzzy fallback
        const base = inp.merchant.trim()
        const candidates = Array.from(new Set([
          base,
          ...(base.length > 6 ? [base.slice(0, 6)] : []),
          ...(base.length > 4 ? [base.slice(0, 4)] : []),
          ...(base.length > 3 ? [base.slice(0, 3)] : []),
        ]))

        type TxnRow = { date: string; description: string; amount_brl: number | null; type: string }
        let txns: TxnRow[] | null = null
        let matchedTerm = base

        for (const term of candidates) {
          const build = () => {
            let q = supabaseAdmin
              .from('finance_transactions')
              .select('date, description, amount_brl, type')
              .eq('user_id', userId)
              .ilike('description', `%${term}%`)
              .order('date', { ascending: true })
              .limit(500)
            if (inp.from_date) q = q.gte('date', inp.from_date)
            if (inp.to_date)   q = q.lte('date', inp.to_date)
            return q
          }
          const { data } = await build()
          if (data && data.length > 0) { txns = data as TxnRow[]; matchedTerm = term; break }
        }

        if (!txns?.length) {
          return `No transactions found matching "${base}" (also tried shorter variants). The merchant may use a different name in the bank statement. Use list_merchants to browse available merchant names.`
        }

        const fuzzyNote = matchedTerm !== base ? ` (matched on "${matchedTerm}" — broader search)` : ''
        const expenses = txns.filter(t => t.type === 'expense')
        const incomes  = txns.filter(t => t.type === 'income')
        const totalExpense = expenses.reduce((s, t) => s + Math.abs(t.amount_brl ?? 0), 0)
        const totalIncome  = incomes.reduce((s, t) => s + (t.amount_brl ?? 0), 0)
        const firstDate = txns[0].date
        const lastDate  = txns[txns.length - 1].date

        const lines = txns.map(t =>
          `${t.date} | ${t.type === 'expense' ? '↓' : '↑'} R$${Math.abs(t.amount_brl ?? 0).toFixed(2)} | ${t.description}`
        )

        return [
          `Merchant: "${base}"${fuzzyNote} | ${txns.length} transaction(s) | ${firstDate} → ${lastDate}`,
          expenses.length > 0 ? `Total expenses: R$${totalExpense.toFixed(2)} (${expenses.length} txns)` : '',
          incomes.length  > 0 ? `Total income: R$${totalIncome.toFixed(2)} (${incomes.length} txns)` : '',
          '',
          ...lines,
        ].filter(Boolean).join('\n')
      }

      case 'list_merchants': {
        const inp = input as { limit?: number; type?: string }
        let q = supabaseAdmin
          .from('finance_transactions')
          .select('description, amount_brl, type')
          .eq('user_id', userId)
          .not('description', 'is', null)
          .limit(2000)
        if (inp.type) q = q.eq('type', inp.type)

        const { data: rows } = await q
        if (!rows?.length) return 'No transactions found.'

        // Extract first meaningful word(s) from each description as a "merchant" proxy
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

        return `Top merchants by frequency:\n${sorted.join('\n')}`
      }

      case 'get_financial_summary': {
        const months = (input.months as number) ?? 6
        const d = new Date()
        d.setMonth(d.getMonth() - months)
        const fromDate = d.toISOString().split('T')[0]

        const { data: txns } = await supabaseAdmin
          .from('finance_transactions')
          .select('date, amount_brl, type')
          .eq('user_id', userId)
          .eq('exclude_from_stats', false)
          .gte('date', fromDate)

        const byMonth: Record<string, { income: number; expense: number }> = {}
        for (const t of (txns ?? [])) {
          const m = t.date.slice(0, 7)
          if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0 }
          if (t.type === 'income') byMonth[m].income += t.amount_brl ?? 0
          else byMonth[m].expense += t.amount_brl ?? 0
        }

        const lines = Object.entries(byMonth)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([m, v]) => `${m}: income R$${v.income.toFixed(0)} | expense R$${v.expense.toFixed(0)} | balance R$${(v.income - v.expense).toFixed(0)}`)

        return `Monthly summary (last ${months} months):\n${lines.join('\n')}`
      }

      case 'get_accounts': {
        const { data: accounts } = await supabaseAdmin
          .from('finance_accounts')
          .select('name, type, currency, current_balance')
          .eq('user_id', userId)
          .eq('active', true)

        if (!accounts?.length) return 'No accounts found.'
        const lines = accounts.map(a => `${a.name} | ${a.type} | ${a.currency} | balance: ${a.current_balance ?? 0}`)
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
  const { userId } = req as AuthRequest
  const { messages } = req.body as { messages: Anthropic.MessageParam[] }

  if (!messages?.length) { res.status(400).json({ error: 'messages required' }); return }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' }); return }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const runMessages: Anthropic.MessageParam[] = [...messages]

  try {
    for (let iter = 0; iter < 5; iter++) {
      const stream = anthropic.messages.stream({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system:     SYSTEM_PROMPT,
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
