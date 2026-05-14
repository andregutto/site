import { Router, Response } from 'express'
import * as XLSX from 'xlsx'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { getMonthlyHistory, Asset } from '../_services/priceService.js'

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

function parseFile(base64: string): MergedOp[] {
  const buf = Buffer.from(base64, 'base64')
  const wb  = XLSX.read(buf, { type: 'buffer' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]

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
    operations = parseFile(file_base64)
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

  // 3. Delete all existing contributions for every asset in this import
  const importAssetIds = tickers.map(t => assetMap.get(t)).filter((id): id is number => id != null)
  let cleaned = 0
  if (importAssetIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('contributions')
      .delete({ count: 'exact' })
      .in('asset_id', importAssetIds)
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

export default router
