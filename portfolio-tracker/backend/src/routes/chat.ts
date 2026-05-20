import { Router, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

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

## App sections

### Investimentos (Portfolio)
- **Dashboard** — total portfolio value in BRL/USD/EUR, performance chart, allocation by asset class
- **Ativos** — individual assets with detail pages (price history, contributions, profitability)
- **Aportes** — buy/sell/income contribution records
- **Performance** — historical charts and monthly breakdown

Asset types:
- ticker (B3): Brazilian stocks, ETFs, FIIs — prices from Brapi
- ticker (international): US stocks, ETFs — prices from Yahoo Finance
- ticker (crypto): Cryptocurrencies — prices from CoinGecko
- fixed_income (Renda Fixa): CDBs, LCIs, LCAs, Tesouro Direto — calculated from BCB indices (CDI, IPCA, Selic)
- manual: Private equity, unlisted funds — user updates value manually
- imovel: Real estate — tracked with purchase value

Asset classes are user-defined groupings with custom colors (e.g., Ações BR, FIIs, Renda Fixa, Cripto, Internacional).

### Finanças (Finances)
- **Visão Geral** — budget overview with income, expenses, envelope breakdown
- **Transações** — all transactions (expenses/income) with categories and accounts
- **Contas** — bank accounts with balances and currencies
- **Importar** — import bank statements (CSV, OFX/QFX, PDF) with AI auto-categorization

Finance concepts:
- Envelopes: budget buckets with monthly limits (e.g., Moradia, Alimentação, Transporte)
- Categories: sub-categories within envelopes
- Accounts: bank accounts (e.g., Revolut EUR, C6 BRL, BNP France)

## Key actions
- Add assets: Investimentos > Aportes > "Novo ativo" button
- Record a contribution: Investimentos > Aportes > "Novo aporte"
- Update manual value: click the asset > "Atualizar valor"
- Import transactions: Finanças > Importar — upload CSV, OFX, or PDF
- Set budget: Finanças > Visão Geral > configure envelopes
- View all transactions: Finanças > Transações

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
    description: 'Get recent transactions with optional filters. Use when the user asks about specific transactions or spending history.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit:     { type: 'number', description: 'Max rows (default 20)' },
        from_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
        to_date:   { type: 'string', description: 'End date YYYY-MM-DD' },
        type:      { type: 'string', enum: ['expense', 'income'] },
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
          const cls = (a.asset_classes as unknown as { name: string } | null)?.name ?? 'No class'
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
        const inp = input as { limit?: number; from_date?: string; to_date?: string; type?: string }
        let q = supabaseAdmin
          .from('finance_transactions')
          .select('date, description, amount_brl, type, finance_categories(name), finance_accounts(name)')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(inp.limit ?? 20)
        if (inp.from_date) q = q.gte('date', inp.from_date)
        if (inp.to_date)   q = q.lte('date', inp.to_date)
        if (inp.type)      q = q.eq('type', inp.type)

        const { data: txns } = await q
        if (!txns?.length) return 'No transactions found.'

        const lines = txns.map(t => {
          const cat = (t.finance_categories as unknown as { name: string } | null)?.name ?? '—'
          const acc = (t.finance_accounts as unknown as { name: string } | null)?.name ?? '—'
          return `${t.date} | ${t.type === 'expense' ? '↓' : '↑'} R$${(t.amount_brl ?? 0).toFixed(0)} | ${t.description} | ${cat} | ${acc}`
        })
        return `Transactions (${txns.length}):\n${lines.join('\n')}`
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
