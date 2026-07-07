import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { getMonthlyHistory, Asset } from '../services/priceService.js'

const router = Router()

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MergedOp {
  date: string        // yyyy-mm-dd
  ticker: string      // normalized (no F suffix)
  type: 'buy' | 'sell'
  quantity: number
  price: number       // weighted avg when merged
  value_brl: number
  institution: string
}

export interface MovOp {
  date: string
  ticker: string      // resolved (e.g. HSML11, not HSML13)
  ticker_raw: string  // from file
  event_type: 'bonificacao' | 'desdobro' | 'subscricao'
  quantity: number    // whole shares only (fractional go to leilão)
  price: number
  value_brl: number
  institution: string
}

interface AssetStatus {
  ticker: string
  status: 'exists_with_contribs' | 'exists_no_contribs' | 'to_create'
  asset_id?: number
  net_qty: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(s: string): string {
  const [d, m, y] = s.split('/')
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Import dinâmico: xlsx só é usado nas duas rotas de parse de planilha B3,
// mas estava sendo parseado no cold start de todas as requests da função.
async function readSheetRows(base64: string): Promise<unknown[][]> {
  const XLSX = await import('xlsx')
  const buf = Buffer.from(base64, 'base64')
  const wb  = XLSX.read(buf, { type: 'buffer' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
}

async function parseFile(base64: string): Promise<MergedOp[]> {
  const rows = await readSheetRows(base64)

  // Collect raw operations (skip header row)
  const raw: MergedOp[] = []
  for (const row of rows.slice(1)) {
    const r = row as (string | number)[]
    const dateStr   = String(r[0]).trim()
    const typeStr   = String(r[1]).trim()
    const ticker_raw = String(r[5]).trim()
    const qty        = Number(r[6])
    const price      = Number(r[7])
    const value      = Number(r[8])
    const institution = String(r[4]).trim()

    if (!dateStr || !typeStr || !ticker_raw || isNaN(qty) || isNaN(price)) continue
    if (typeStr !== 'Compra' && typeStr !== 'Venda') continue

    raw.push({
      date:        parseDate(dateStr),
      ticker:      ticker_raw.replace(/F$/, ''), // normalize fracionário
      type:        typeStr === 'Compra' ? 'buy' : 'sell',
      quantity:    qty,
      price,
      value_brl:   value || Math.round(qty * price * 100) / 100,
      institution,
    })
  }

  // Merge same-day operations (fracionário + normal + multiples)
  const map = new Map<string, MergedOp>()
  for (const op of raw) {
    const key = `${op.date}|${op.ticker}|${op.type}`
    const existing = map.get(key)
    if (existing) {
      const totalValue = existing.value_brl + op.value_brl
      const totalQty   = existing.quantity  + op.quantity
      existing.quantity  = totalQty
      existing.value_brl = Math.round(totalValue * 100) / 100
      existing.price     = Math.round((totalValue / totalQty) * 10000) / 10000
    } else {
      map.set(key, { ...op })
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

async function getAssetStatuses(userId: string, operations: MergedOp[]): Promise<AssetStatus[]> {
  const tickers = [...new Set(operations.map(o => o.ticker))]

  const { data: existingAssets } = await supabaseAdmin
    .from('assets')
    .select('id, code')
    .eq('user_id', userId)
    .in('code', tickers)

  const assetMap = new Map((existingAssets ?? []).map(a => [a.code as string, a.id as number]))

  // Check which existing assets have contributions
  const existingIds = [...assetMap.values()]
  const withContribs = new Set<number>()
  if (existingIds.length > 0) {
    const { data: contribRows } = await supabaseAdmin
      .from('contributions')
      .select('asset_id')
      .in('asset_id', existingIds)
    for (const c of (contribRows ?? [])) withContribs.add(c.asset_id as number)
  }

  return tickers.map(ticker => {
    const assetId = assetMap.get(ticker)
    const ops     = operations.filter(o => o.ticker === ticker)
    const net_qty = ops.reduce((s, o) => s + (o.type === 'buy' ? o.quantity : -o.quantity), 0)

    if (assetId == null) {
      return { ticker, status: 'to_create', net_qty }
    } else if (withContribs.has(assetId)) {
      return { ticker, status: 'exists_with_contribs', asset_id: assetId, net_qty }
    } else {
      return { ticker, status: 'exists_no_contribs', asset_id: assetId, net_qty }
    }
  })
}

// ─── GET /api/import/b3/backup ───────────────────────────────────────────────
// Download all contributions as CSV for backup before import

router.get('/b3/backup', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  const { data: assets } = await supabaseAdmin
    .from('assets').select('id, code').eq('user_id', userId)

  const assetIds = (assets ?? []).map(a => a.id as number)
  const assetCode = new Map((assets ?? []).map(a => [a.id as number, a.code as string]))

  const { data: contribs, error } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, date, type, quantity, price_orig, currency, fx_rate_brl, value_brl, description')
    .in('asset_id', assetIds)
    .order('date')

  if (error) { res.status(500).json({ error: error.message }); return }

  const rows = (contribs ?? []).map(c => ({
    ticker:      assetCode.get(c.asset_id as number) ?? '',
    date:        c.date,
    type:        c.type,
    quantity:    c.quantity,
    price_orig:  c.price_orig,
    currency:    c.currency,
    fx_rate_brl: c.fx_rate_brl,
    value_brl:   c.value_brl,
    description: c.description ?? '',
  }))

  res.json(rows)
})

// ─── POST /api/import/b3/parse ────────────────────────────────────────────────
// Parse xlsx, return preview without touching the DB

router.post('/b3/parse', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { file_base64 } = req.body as { file_base64?: string }

  if (!file_base64) { res.status(400).json({ error: 'file_base64 obrigatório' }); return }

  let operations: MergedOp[]
  try {
    operations = await parseFile(file_base64)
  } catch (e) {
    res.status(400).json({ error: `Falha ao ler arquivo: ${e instanceof Error ? e.message : e}` }); return
  }

  if (operations.length === 0) { res.status(400).json({ error: 'Nenhuma operação encontrada no arquivo' }); return }

  const asset_statuses = await getAssetStatuses(userId, operations)
  const dates = operations.map(o => o.date).sort()

  res.json({
    operations,
    asset_statuses,
    summary: {
      raw_rows:    operations.length,
      tickers:     asset_statuses.length,
      to_create:   asset_statuses.filter(a => a.status === 'to_create').length,
      to_clean:    asset_statuses.filter(a => a.status === 'exists_with_contribs').length,
      date_from:   dates[0],
      date_to:     dates[dates.length - 1],
      buys:        operations.filter(o => o.type === 'buy').length,
      sells:       operations.filter(o => o.type === 'sell').length,
    },
  })
})

// ─── POST /api/import/b3/execute ─────────────────────────────────────────────
// Execute the import: create assets, clean contributions, insert new ones

router.post('/b3/execute', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { operations } = req.body as { operations?: MergedOp[] }

  if (!Array.isArray(operations) || operations.length === 0) {
    res.status(400).json({ error: 'operations obrigatório' }); return
  }

  const tickers = [...new Set(operations.map(o => o.ticker))]

  // 1. Get existing assets + user classes for auto-assignment
  const [{ data: existingAssets }, { data: userClasses }] = await Promise.all([
    supabaseAdmin.from('assets').select('id, code').eq('user_id', userId).in('code', tickers),
    supabaseAdmin.from('asset_classes').select('id, name').eq('user_id', userId),
  ])

  const assetMap = new Map((existingAssets ?? []).map(a => [a.code as string, a.id as number]))

  // Resolve class_id by name pattern (FII = ends in 11, else Ações)
  function resolveClassId(ticker: string): number | null {
    if (!userClasses?.length) return null
    const isFii = /\d{2}11$/.test(ticker)
    const patterns = isFii
      ? [/fii/i, /imobili/i, /fundo/i]
      : [/a[çc][oõ]es?/i, /a[çc]ao/i, /b3/i, /acion/i, /equit/i]
    for (const p of patterns) {
      const found = userClasses.find(c => p.test(c.name))
      if (found) return found.id as number
    }
    return null
  }

  // 2. Create missing assets
  const toCreate = tickers.filter(t => !assetMap.has(t))
  let created = 0
  for (const ticker of toCreate) {
    const ops      = operations.filter(o => o.ticker === ticker)
    const net_qty  = ops.reduce((s, o) => s + (o.type === 'buy' ? o.quantity : -o.quantity), 0)
    const classId  = resolveClassId(ticker)
    const { data: newAsset, error: createErr } = await supabaseAdmin
      .from('assets')
      .insert({
        user_id:      userId,
        code:         ticker,
        name:         ticker,
        asset_type:   'ticker',
        currency:     'BRL',
        ticker_brapi: ticker,
        active:       net_qty > 0,
        ...(classId != null ? { class_id: classId } : {}),
      })
      .select('id')
      .single()
    if (createErr) { console.warn(`[import] Erro ao criar ${ticker}:`, createErr.message); continue }
    if (newAsset) { assetMap.set(ticker, newAsset.id as number); created++ }
  }

  // 3. Delete negociação contributions (preserve movimentação entries)
  const importAssetIds = tickers.map(t => assetMap.get(t)).filter((id): id is number => id != null)
  let cleaned = 0
  if (importAssetIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('contributions')
      .delete({ count: 'exact' })
      .in('asset_id', importAssetIds)
      .not('description', 'ilike', '%(B3 Movimentação)%')
    cleaned = count ?? 0
  }

  // 4. Insert contributions
  const toInsert = operations
    .filter(op => assetMap.has(op.ticker))
    .map(op => ({
      asset_id:    assetMap.get(op.ticker)!,
      date:        op.date,
      type:        op.type,
      quantity:    op.quantity,
      price_orig:  op.price,
      currency:    'BRL',
      fx_rate_brl: 1,
      value_brl:   op.value_brl,
      description: op.institution,
    }))

  const { error: insertErr } = await supabaseAdmin.from('contributions').insert(toInsert)
  if (insertErr) { res.status(500).json({ error: `Erro ao inserir: ${insertErr.message}` }); return }

  // 5. Update active status for each asset based on net position
  for (const ticker of tickers) {
    const assetId = assetMap.get(ticker)
    if (!assetId) continue
    const ops     = operations.filter(o => o.ticker === ticker)
    const net_qty = ops.reduce((s, o) => s + (o.type === 'buy' ? o.quantity : -o.quantity), 0)
    if (net_qty <= 0 && toCreate.includes(ticker)) {
      // Already created as inactive — keep
    } else {
      // Update active status for existing assets based on net position
      await supabaseAdmin.from('assets')
        .update({ active: net_qty > 0 })
        .eq('id', assetId)
        .eq('user_id', userId)
    }
  }

  // Build final positions for review
  const asset_positions = tickers
    .filter(t => assetMap.has(t))
    .map(ticker => {
      const ops     = operations.filter(o => o.ticker === ticker)
      const net_qty = ops.reduce((s, o) => s + (o.type === 'buy' ? o.quantity : -o.quantity), 0)
      return { ticker, net_qty, active: net_qty > 0 }
    })
    .sort((a, b) => b.net_qty - a.net_qty)

  res.json({
    created_assets:         created,
    cleaned_contributions:  cleaned,
    imported_contributions: toInsert.length,
    tickers_total:          tickers.length,
    skipped_tickers:        tickers.filter(t => !assetMap.has(t)),
    asset_positions,
  })

  // Background: sync price history for all imported ticker assets (fire-and-forget)
  ;(async () => {
    const { data: tickerAssets } = await supabaseAdmin
      .from('assets')
      .select('id, code, asset_type, currency, ticker_brapi, ticker_yahoo, coingecko_id, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread')
      .eq('user_id', userId)
      .eq('asset_type', 'ticker')
      .in('id', importAssetIds)
    const syncAssets = (tickerAssets ?? []).filter(a => a.ticker_brapi || a.ticker_yahoo || a.coingecko_id)
    console.log(`[import-sync] starting background sync for ${syncAssets.length} assets`)
    for (let i = 0; i < syncAssets.length; i++) {
      const a = syncAssets[i]
      try {
        const history = await getMonthlyHistory(a as Asset, 72)
        if (history.length) {
          await supabaseAdmin.from('price_history').upsert(
            history.map(h => ({ asset_id: a.id, ref_date: h.date, price: h.price, currency: a.currency || 'BRL' })),
            { onConflict: 'asset_id,ref_date' }
          )
        }
      } catch (err) {
        console.warn(`[import-sync] ${a.code} error:`, err instanceof Error ? err.message : err)
      }
      if (i + 1 < syncAssets.length) await new Promise(r => setTimeout(r, 5000))
    }
    console.log('[import-sync] background sync complete for', syncAssets.length, 'assets')
  })().catch(err => console.error('[import-sync] fatal:', err))
})

// ─── Movimentação helpers ─────────────────────────────────────────────────────

async function parseMovimentacao(base64: string): Promise<MovOp[]> {
  const rows = await readSheetRows(base64)
  // Columns: Entrada/Saída, Data, Movimentação, Produto, Instituição, Quantidade, Preço, Valor

  // First pass: index subscription exercise payments by (approx_date, qty)
  type SubscEntry = { date: string; ticker_raw: string; qty: number; value: number }
  const subscExercised: SubscEntry[] = []
  for (const row of rows.slice(1)) {
    const r      = row as (string | number)[]
    const entrada = String(r[0]).trim()
    const tipo    = String(r[2]).trim()
    if (entrada !== 'Debito' || tipo !== 'Direitos de Subscrição - Exercido') continue
    const dateStr = String(r[1]).trim()
    const produto = String(r[3]).trim()
    const qty     = Number(r[5])
    const valor   = r[7] !== '-' && r[7] !== '' ? Number(r[7]) : 0
    if (!dateStr || isNaN(qty) || qty <= 0) continue
    subscExercised.push({ date: parseDate(dateStr), ticker_raw: produto.split(' - ')[0].trim(), qty, value: valor })
  }

  // Second pass: build operations
  const ops: MovOp[] = []
  for (const row of rows.slice(1)) {
    const r       = row as (string | number)[]
    const entrada = String(r[0]).trim()
    const dateStr = String(r[1]).trim()
    const tipo    = String(r[2]).trim()
    const produto = String(r[3]).trim()
    const inst    = String(r[4]).trim()
    const qty_raw = Number(r[5])

    if (!dateStr || !tipo || isNaN(qty_raw)) continue
    const qty_whole = Math.floor(qty_raw)
    if (qty_whole <= 0) continue

    const date       = parseDate(dateStr)
    const ticker_raw = produto.split(' - ')[0].trim()

    if ((tipo === 'Bonificação em Ativos' || tipo === 'Desdobro') && entrada === 'Credito') {
      ops.push({
        date, ticker: ticker_raw, ticker_raw,
        event_type: tipo === 'Desdobro' ? 'desdobro' : 'bonificacao',
        quantity: qty_whole, price: 0, value_brl: 0, institution: inst,
      })
    } else if (tipo === 'Recibo de Subscrição' && entrada === 'Credito') {
      // Map receipt ticker (e.g. HSML13) to actual asset ticker (HSML11)
      const ticker = ticker_raw.replace(/1[23]$/, '11')
      // Find matching exercise payment (same qty, within 7 days)
      const dateMs = new Date(date).getTime()
      const match  = subscExercised.find(s =>
        s.qty === qty_raw &&
        Math.abs(new Date(s.date).getTime() - dateMs) <= 7 * 86_400_000
      )
      const value_brl = match?.value ?? 0
      const price     = qty_whole > 0 ? Math.round((value_brl / qty_whole) * 100) / 100 : 0
      ops.push({ date, ticker, ticker_raw, event_type: 'subscricao', quantity: qty_whole, price, value_brl, institution: inst })
    }
  }

  return ops.sort((a, b) => a.date.localeCompare(b.date))
}

// ─── POST /api/import/movimentacao/parse ──────────────────────────────────────

router.post('/movimentacao/parse', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { file_base64 } = req.body as { file_base64?: string }
  if (!file_base64) { res.status(400).json({ error: 'file_base64 obrigatório' }); return }

  let operations: MovOp[]
  try { operations = await parseMovimentacao(file_base64) }
  catch (e) { res.status(400).json({ error: `Falha ao ler arquivo: ${e instanceof Error ? e.message : e}` }); return }

  if (operations.length === 0) { res.status(400).json({ error: 'Nenhum evento corporativo encontrado no arquivo' }); return }

  const tickers = [...new Set(operations.map(o => o.ticker))]
  const { data: existingAssets } = await supabaseAdmin
    .from('assets').select('id, code').eq('user_id', userId).in('code', tickers)
  const assetMap = new Map((existingAssets ?? []).map(a => [a.code as string, a.id as number]))

  const asset_statuses = tickers.map(ticker => {
    const ticker_raw = operations.find(o => o.ticker === ticker)?.ticker_raw ?? ticker
    const asset_id   = assetMap.get(ticker)
    return { ticker, ticker_raw, in_tracker: asset_id != null, asset_id }
  })

  const dates = operations.map(o => o.date).sort()
  res.json({
    operations,
    asset_statuses,
    summary: {
      total_events:  operations.length,
      bonificacoes:  operations.filter(o => o.event_type === 'bonificacao').length,
      desdobros:     operations.filter(o => o.event_type === 'desdobro').length,
      subscricoes:   operations.filter(o => o.event_type === 'subscricao').length,
      qty_added:     operations.reduce((s, o) => s + o.quantity, 0),
      value_brl:     Math.round(operations.reduce((s, o) => s + o.value_brl, 0) * 100) / 100,
      date_from:     dates[0],
      date_to:       dates[dates.length - 1],
    },
  })
})

// ─── POST /api/import/movimentacao/execute ────────────────────────────────────

router.post('/movimentacao/execute', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { operations } = req.body as { operations?: MovOp[] }
  if (!Array.isArray(operations) || operations.length === 0) {
    res.status(400).json({ error: 'operations obrigatório' }); return
  }

  const tickers = [...new Set(operations.map(o => o.ticker))]
  const { data: assets } = await supabaseAdmin
    .from('assets').select('id, code').eq('user_id', userId).in('code', tickers)
  const assetMap = new Map((assets ?? []).map(a => [a.code as string, a.id as number]))

  const knownIds = tickers.map(t => assetMap.get(t)).filter((id): id is number => id != null)

  // Replace only movimentação contributions for these assets (idempotent re-import)
  let replaced = 0
  if (knownIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('contributions')
      .delete({ count: 'exact' })
      .in('asset_id', knownIds)
      .ilike('description', '%(B3 Movimentação)%')
    replaced = count ?? 0
  }

  const toInsert = operations
    .filter(op => assetMap.has(op.ticker))
    .map(op => ({
      asset_id:    assetMap.get(op.ticker)!,
      date:        op.date,
      type:        'buy',
      quantity:    op.quantity,
      price_orig:  op.price,
      currency:    'BRL',
      fx_rate_brl: 1,
      value_brl:   op.value_brl,
      description: `${op.event_type === 'bonificacao' ? 'Bonificação em Ativos' : op.event_type === 'desdobro' ? 'Desdobro' : 'Subscrição exercida'} (B3 Movimentação)`,
      tax_withheld: 0,
    }))

  if (toInsert.length === 0) { res.status(400).json({ error: 'Nenhum ativo encontrado no sistema para os eventos' }); return }

  const { error: insertErr } = await supabaseAdmin.from('contributions').insert(toInsert)
  if (insertErr) { res.status(500).json({ error: `Erro ao inserir: ${insertErr.message}` }); return }

  res.json({
    imported: toInsert.length,
    replaced,
    skipped_tickers: tickers.filter(t => !assetMap.has(t)),
  })
})

export default router
