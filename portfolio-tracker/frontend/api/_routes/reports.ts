import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { cache } from '../_lib/cache.js'

const router = Router()

// ─── France Tax Report ────────────────────────────────────────────────────────

type EventType = 'DIVIDEND' | 'JCP' | 'FII_INCOME' | 'INTEREST'
type FormType  = '2DC' | '2TR'

const EVENT_TYPE_MAP: Record<string, EventType> = {
  dividend:   'DIVIDEND',
  dividendo:  'DIVIDEND',
  jcp:        'JCP',
  fii:        'FII_INCOME',
  fii_income: 'FII_INCOME',
  rendimento: 'FII_INCOME',
  interest:   'INTEREST',
  interests:  'INTEREST',
  coupon:     'INTEREST',
  juros:      'INTEREST',
  rf:         'INTEREST',
  cdb:        'INTEREST',
}

const FORM_TYPE_MAP: Record<EventType, FormType> = {
  DIVIDEND:   '2DC',
  FII_INCOME: '2DC',
  JCP:        '2TR',
  INTEREST:   '2TR',
}

const CONVENTION_RATES: Record<string, number> = {
  BR_DIVIDEND:   0.15,
  BR_JCP:        0.15,
  BR_FII_INCOME: 0.00,
  BR_INTEREST:   0.15,
  US_DIVIDEND:   0.15,
  TW_DIVIDEND:   0.10,
  IE_DIVIDEND:   0.15,
}

const WITHHOLDING_RATES: Record<string, number> = {
  BR_DIVIDEND:   0.00,
  BR_JCP:        0.15,
  BR_FII_INCOME: 0.00,
  BR_INTEREST:   0.15,
  US_DIVIDEND:   0.15,
  TW_DIVIDEND:   0.21,
  IE_DIVIDEND:   0.15,
}

const BROKER_INFO: Record<string, { institution: string; address: string; country: string }> = {
  'Interactive Brokers': {
    institution: 'Interactive Brokers Ireland Ltd',
    address:     'Two Harbourmaster Place, IFSC, Dublin 1, Ireland',
    country:     'Irlande',
  },
  'XP': {
    institution: 'XP Investimentos CCTVM S/A',
    address:     'Av. Chedid Jafet, 75 — Vila Olímpia, São Paulo, SP — Brésil',
    country:     'Brésil',
  },
  'BTG': {
    institution: 'Banco BTG Pactual S.A.',
    address:     'Av. Brigadeiro Faria Lima, 3477 — Itaim Bibi, São Paulo, SP — Brésil',
    country:     'Brésil',
  },
  'C6': {
    institution: 'Banco C6 S.A.',
    address:     'Al. Joaquim Eugênio de Lima, 680 — Jardim Paulista, São Paulo, SP — Brésil',
    country:     'Brésil',
  },
}

const TICKER_COUNTRY_OVERRIDES: Record<string, string> = {
  TSM: 'TW',
  UMC: 'TW',
}

function normaliseCountry(raw: string | null): string {
  if (!raw) return 'OTHER'
  const v = raw.trim().toLowerCase()
  if (['brasil', 'brazil', 'br'].includes(v)) return 'BR'
  if (['usa', 'united states', 'us', 'estados unidos'].includes(v)) return 'US'
  if (['taiwan', 'tw'].includes(v)) return 'TW'
  if (['ireland', 'irlanda', 'ie'].includes(v)) return 'IE'
  return 'OTHER'
}

function normaliseBroker(exchange: string | null): string {
  if (!exchange) return 'Outros'
  const v = exchange.toLowerCase()
  if (v.includes('interactive brokers') || v === 'ibkr') return 'Interactive Brokers'
  if (v === 'xp' || v.includes('xp investimentos')) return 'XP'
  if (v === 'btg' || v.includes('btg')) return 'BTG'
  if (v === 'c6' || v.includes('banco c6') || v.includes('bco c6')) return 'C6'
  return exchange
}

function mapEventType(dividendType: string | null, description: string | null): EventType {
  const raw = (dividendType ?? description ?? '').toLowerCase().trim()
  return EVENT_TYPE_MAP[raw] ?? 'DIVIDEND'
}

async function fetchBcbSeries(
  moeda: 'EUR' | 'USD',
  year: number,
): Promise<Array<{ date: string; rate: number }>> {
  const start = `01-01-${year}`
  const end   = `12-31-${year}`
  const url   = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='${moeda}'&@dataInicial='${start}'&@dataFinalCotacao='${end}'&$top=400&$filter=tipoBoletim%20eq%20'Fechamento'&$format=json&$select=cotacaoVenda,dataHoraCotacao`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`BCB PTAX ${res.status} for ${moeda}`)
  const data = await res.json() as { value: Array<{ cotacaoVenda: number; dataHoraCotacao: string }> }
  return (data.value ?? []).map(p => ({
    date: p.dataHoraCotacao.split(' ')[0],
    rate: p.cotacaoVenda,
  }))
}

async function fetchYearFxRates(
  year: number,
  pair: string,
): Promise<Record<string, number>> {
  const TTL = 24 * 60 * 60 * 1000
  const map: Record<string, number> = {}

  if (pair === 'BRL-EUR') {
    const series = await cache.getOrFetch(
      `fx_bcb_eur_${year}`, TTL,
      () => fetchBcbSeries('EUR', year),
    ) as Array<{ date: string; rate: number }>
    for (const { date, rate } of series) {
      if (rate > 0) map[date] = 1 / rate
    }
    return map
  }

  if (pair === 'USD-EUR') {
    const [eurSeries, usdSeries] = await Promise.all([
      cache.getOrFetch(`fx_bcb_eur_${year}`, TTL, () => fetchBcbSeries('EUR', year)),
      cache.getOrFetch(`fx_bcb_usd_${year}`, TTL, () => fetchBcbSeries('USD', year)),
    ]) as [Array<{ date: string; rate: number }>, Array<{ date: string; rate: number }>]
    const eurBrl: Record<string, number> = {}
    for (const { date, rate } of eurSeries) eurBrl[date] = rate
    for (const { date, rate } of usdSeries) {
      const eur = eurBrl[date]
      if (eur && eur > 0) map[date] = rate / eur
    }
    return map
  }

  return map
}

function getNearestRate(rateMap: Record<string, number>, date: string, fallback: number): number {
  if (rateMap[date]) return rateMap[date]
  const dates = Object.keys(rateMap).sort()
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] <= date) return rateMap[dates[i]]
  }
  return fallback
}

function getYearEndRate(rateMap: Record<string, number>, year: number): number {
  const dec = Object.keys(rateMap)
    .filter(d => d.startsWith(`${year}-12`))
    .sort()
  if (dec.length > 0) return rateMap[dec[dec.length - 1]]
  const all = Object.keys(rateMap).sort()
  return all.length > 0 ? rateMap[all[all.length - 1]] : 0
}

// GET /api/reports/france/:year
router.get('/france/:year', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const year = parseInt(req.params.year, 10)
  if (isNaN(year) || year < 2020 || year > 2100) {
    res.status(400).json({ error: 'Ano inválido' }); return
  }

  const startDate = `${year}-01-01`
  const endDate   = `${year}-12-31`

  const { data: assets, error: ae } = await supabaseAdmin
    .from('assets')
    .select('id, code, name, asset_type, currency, exchange, country')
    .eq('user_id', userId)

  if (ae) { res.status(500).json({ error: ae.message }); return }
  const assetMap = Object.fromEntries((assets ?? []).map(a => [a.id, a]))
  const assetIds = Object.keys(assetMap).map(Number)

  if (assetIds.length === 0) {
    res.json({ year, events: [], sections_daily: [], sections_year_end: [], totals_daily: { dividends_eur: 0, interests_eur: 0, credit_eur: 0 }, totals_year_end: { dividends_eur: 0, interests_eur: 0, credit_eur: 0 }, accounts: [], fx_rates: { year_end_brl_eur: 0, year_end_usd_eur: 0 } })
    return
  }

  let divRows: Array<{ id: unknown; asset_id: unknown; ex_date: unknown; amount_brl: unknown; currency: unknown; dividend_type: unknown; tax_withheld?: unknown; country_of_dividend?: unknown }> | null = null
  {
    const { data: d1, error: e1 } = await supabaseAdmin
      .from('dividends')
      .select('id, asset_id, ex_date, amount_brl, currency, dividend_type, tax_withheld, country_of_dividend')
      .in('asset_id', assetIds)
      .eq('user_id', userId)
      .gte('ex_date', startDate)
      .lte('ex_date', endDate)
      .order('ex_date')
    if (e1 && e1.message?.includes('does not exist')) {
      const { data: d2, error: e2 } = await supabaseAdmin
        .from('dividends')
        .select('id, asset_id, ex_date, amount_brl, currency, dividend_type')
        .in('asset_id', assetIds)
        .eq('user_id', userId)
        .gte('ex_date', startDate)
        .lte('ex_date', endDate)
        .order('ex_date')
      if (e2) { res.status(500).json({ error: e2.message }); return }
      divRows = d2
    } else if (e1) {
      res.status(500).json({ error: e1.message }); return
    } else {
      divRows = d1
    }
  }

  const { data: incRows, error: ie } = await supabaseAdmin
    .from('contributions')
    .select('id, asset_id, date, value_brl, description, currency, price_orig, quantity, tax_withheld')
    .in('asset_id', assetIds)
    .eq('type', 'income')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')

  if (ie) { res.status(500).json({ error: ie.message }); return }

  let brlEurMap: Record<string, number> = {}
  let usdEurMap: Record<string, number> = {}
  try {
    [brlEurMap, usdEurMap] = await Promise.all([
      fetchYearFxRates(year, 'BRL-EUR'),
      fetchYearFxRates(year, 'USD-EUR'),
    ])
  } catch (err) {
    console.error('FX fetch error:', err)
  }

  const yearEndBrlEur = getYearEndRate(brlEurMap, year)
  const yearEndUsdEur = getYearEndRate(usdEurMap, year)
  const fallbackBrlEur = yearEndBrlEur || 0.17
  const fallbackUsdEur = yearEndUsdEur || 1.05

  interface TaxEvent {
    id: string; date: string; asset_code: string; asset_name: string; asset_type: string
    event_type: EventType; form_type: FormType; country: string; broker: string; currency: string
    gross_amount: number; tax_withheld_src: number
    gross_eur_daily: number; tax_withheld_eur_daily: number
    gross_eur_year_end: number; tax_withheld_eur_year_end: number
    fx_rate_daily: number; fx_rate_year_end: number
  }

  const events: TaxEvent[] = []

  for (const d of (divRows ?? [])) {
    const asset = assetMap[d.asset_id]
    if (!asset) continue
    const currency    = (d.currency ?? asset.currency ?? 'BRL') as string
    const grossAmount = (d.amount_brl ?? 0) as number
    if (grossAmount <= 0) continue

    const country   = normaliseCountry((d.country_of_dividend ?? TICKER_COUNTRY_OVERRIDES[asset.code as string] ?? asset.country) as string | null)
    if (country === 'OTHER') continue
    const broker    = normaliseBroker(asset.exchange as string | null)
    const eventType = mapEventType(d.dividend_type as string | null, null)
    const formType  = FORM_TYPE_MAP[eventType]
    const key       = `${country}_${eventType}`
    const withheld  = (d.tax_withheld ?? 0) as number
    const theoretical = withheld > 0 ? withheld : grossAmount * (WITHHOLDING_RATES[key] ?? 0)

    const fxD  = currency === 'EUR' ? 1 : currency === 'BRL' ? getNearestRate(brlEurMap, d.ex_date as string, fallbackBrlEur) : getNearestRate(usdEurMap, d.ex_date as string, fallbackUsdEur)
    const fxYE = currency === 'EUR' ? 1 : currency === 'BRL' ? (yearEndBrlEur || fallbackBrlEur) : (yearEndUsdEur || fallbackUsdEur)

    events.push({ id: `div_${d.id}`, date: d.ex_date as string, asset_code: asset.code as string, asset_name: asset.name as string, asset_type: asset.asset_type as string, event_type: eventType, form_type: formType, country, broker, currency, gross_amount: grossAmount, tax_withheld_src: theoretical, gross_eur_daily: grossAmount * fxD, tax_withheld_eur_daily: theoretical * fxD, gross_eur_year_end: grossAmount * fxYE, tax_withheld_eur_year_end: theoretical * fxYE, fx_rate_daily: fxD, fx_rate_year_end: fxYE })
  }

  for (const c of (incRows ?? [])) {
    const asset = assetMap[c.asset_id]
    if (!asset) continue
    const grossAmount = (c.value_brl ?? 0) as number
    if (grossAmount <= 0) continue
    const country = normaliseCountry(asset.country as string | null)
    if (country === 'OTHER') continue
    const broker    = normaliseBroker(asset.exchange as string | null)
    const desc      = (c.description ?? '') as string
    const eventType = mapEventType(null, desc.toLowerCase().includes('jcp') ? 'jcp' : desc.toLowerCase().includes('fii') ? 'fii' : asset.asset_type === 'fixed_income' ? 'interest' : null)
    const formType  = FORM_TYPE_MAP[eventType]
    const currency  = (c.currency ?? asset.currency ?? 'BRL') as string
    const key          = `${country}_${eventType}`
    const actualWithheld = (c.tax_withheld ?? 0) as number
    const theoretical    = grossAmount * (WITHHOLDING_RATES[key] ?? 0)
    const withheld       = actualWithheld > 0 ? actualWithheld : theoretical
    const fxD  = currency === 'EUR' ? 1 : currency === 'BRL' ? getNearestRate(brlEurMap, c.date as string, fallbackBrlEur) : getNearestRate(usdEurMap, c.date as string, fallbackUsdEur)
    const fxYE = currency === 'EUR' ? 1 : currency === 'BRL' ? (yearEndBrlEur || fallbackBrlEur) : (yearEndUsdEur || fallbackUsdEur)
    events.push({ id: `inc_${c.id}`, date: c.date as string, asset_code: asset.code as string, asset_name: asset.name as string, asset_type: asset.asset_type as string, event_type: eventType, form_type: formType, country, broker, currency, gross_amount: grossAmount, tax_withheld_src: withheld, gross_eur_daily: grossAmount * fxD, tax_withheld_eur_daily: withheld * fxD, gross_eur_year_end: grossAmount * fxYE, tax_withheld_eur_year_end: withheld * fxYE, fx_rate_daily: fxD, fx_rate_year_end: fxYE })
  }

  interface Section2047 {
    key: string; country: string; broker: string; event_type: EventType; form_type: FormType
    convention_rate: number; gross_eur: number; theoretical_credit_eur: number
    actual_withholding_eur: number; effective_credit_eur: number; event_count: number
  }

  function buildSections(method: 'daily' | 'year_end'): Section2047[] {
    const map = new Map<string, Section2047>()
    for (const e of events) {
      const k = `${e.country}_${e.broker}_${e.event_type}`
      const convRate = CONVENTION_RATES[`${e.country}_${e.event_type}`] ?? 0
      const gross    = method === 'daily' ? e.gross_eur_daily : e.gross_eur_year_end
      const withheld = method === 'daily' ? e.tax_withheld_eur_daily : e.tax_withheld_eur_year_end
      if (!map.has(k)) map.set(k, { key: k, country: e.country, broker: e.broker, event_type: e.event_type, form_type: e.form_type, convention_rate: convRate, gross_eur: 0, theoretical_credit_eur: 0, actual_withholding_eur: 0, effective_credit_eur: 0, event_count: 0 })
      const s = map.get(k)!
      s.gross_eur += gross; s.actual_withholding_eur += withheld; s.event_count += 1
    }
    for (const s of map.values()) {
      s.theoretical_credit_eur = s.gross_eur * s.convention_rate
      s.effective_credit_eur   = Math.min(s.theoretical_credit_eur, s.actual_withholding_eur)
    }
    return Array.from(map.values()).sort((a, b) => a.country.localeCompare(b.country))
  }

  const sectionsDaily   = buildSections('daily')
  const sectionsYearEnd = buildSections('year_end')

  function calcTotals(s: Section2047[]) {
    return {
      dividends_eur: s.filter(x => x.form_type === '2DC').reduce((a, x) => a + x.gross_eur, 0),
      interests_eur: s.filter(x => x.form_type === '2TR').reduce((a, x) => a + x.gross_eur, 0),
      credit_eur:    s.reduce((a, x) => a + x.effective_credit_eur, 0),
    }
  }

  const totalsDaily   = calcTotals(sectionsDaily)
  const totalsYearEnd = calcTotals(sectionsYearEnd)
  const totalD = totalsDaily.dividends_eur + totalsDaily.interests_eur
  const totalY = totalsYearEnd.dividends_eur + totalsYearEnd.interests_eur

  // Capital gains (plus-values / moins-values) — 3VG / 3VM
  const { data: sellContribs } = await supabaseAdmin
    .from('contributions').select('id, asset_id, date, quantity, value_brl')
    .in('asset_id', assetIds).eq('user_id', userId).eq('type', 'sell')
    .gte('date', startDate).lte('date', endDate).order('date')

  const { data: allBuys } = await supabaseAdmin
    .from('contributions').select('asset_id, quantity, value_brl')
    .in('asset_id', assetIds).eq('user_id', userId).eq('type', 'buy')
    .lte('date', endDate).order('date')

  const costBasisMap: Record<number, { totalQty: number; totalCost: number }> = {}
  for (const b of (allBuys ?? [])) {
    const aid = b.asset_id as number
    if (!costBasisMap[aid]) costBasisMap[aid] = { totalQty: 0, totalCost: 0 }
    costBasisMap[aid].totalQty  += (b.quantity ?? 0) as number
    costBasisMap[aid].totalCost += (b.value_brl ?? 0) as number
  }

  const capitalGains = (sellContribs ?? []).reduce((acc, s) => {
    const asset = assetMap[s.asset_id as number]
    if (!asset || (asset.asset_type as string) !== 'ticker') return acc
    const country = TICKER_COUNTRY_OVERRIDES[asset.code as string] ?? normaliseCountry(asset.country as string | null)
    const broker  = normaliseBroker(asset.exchange as string | null)
    const b       = costBasisMap[s.asset_id as number] ?? { totalQty: 0, totalCost: 0 }
    const avgCost = b.totalQty > 0 ? b.totalCost / b.totalQty : 0
    const qty = (s.quantity ?? 1) as number
    const saleValue = (s.value_brl ?? 0) as number
    const basis = avgCost * qty
    const gainLoss = saleValue - basis
    const date = s.date as string
    const fxD  = getNearestRate(brlEurMap, date, fallbackBrlEur)
    const fxYE = yearEndBrlEur || fallbackBrlEur
    acc.push({ id: s.id as number, date, asset_code: asset.code as string, asset_name: asset.name as string, country, broker, qty, sale_value_brl: saleValue, cost_basis_brl: basis, gain_loss_brl: gainLoss, gain_loss_eur_daily: gainLoss * fxD, gain_loss_eur_year_end: gainLoss * fxYE, fx_rate_daily: fxD, fx_rate_year_end: fxYE })
    return acc
  }, [] as Array<{ id: number; date: string; asset_code: string; asset_name: string; country: string; broker: string; qty: number; sale_value_brl: number; cost_basis_brl: number; gain_loss_brl: number; gain_loss_eur_daily: number; gain_loss_eur_year_end: number; fx_rate_daily: number; fx_rate_year_end: number }>)

  const totalGainEurDaily   = capitalGains.reduce((s, g) => s + g.gain_loss_eur_daily, 0)
  const totalGainEurYearEnd = capitalGains.reduce((s, g) => s + g.gain_loss_eur_year_end, 0)

  const brokersSeen = new Set([
    ...events.map(e => e.broker),
    ...(assets ?? []).map(a => normaliseBroker(a.exchange as string | null)),
  ])
  const accounts = Array.from(brokersSeen).filter(b => BROKER_INFO[b]).map(b => ({ broker: b, ...BROKER_INFO[b], status: 'Ouvert' }))

  res.json({
    year, events, sections_daily: sectionsDaily, sections_year_end: sectionsYearEnd,
    totals_daily: totalsDaily, totals_year_end: totalsYearEnd,
    comparison: {
      daily:    { ...totalsDaily,   total_eur: totalD },
      year_end: { ...totalsYearEnd, total_eur: totalY },
      recommended: totalD <= totalY ? 'daily' : 'year_end',
      advantage_eur: Math.abs(totalD - totalY),
    },
    accounts,
    capital_gains: capitalGains,
    total_gain_eur_daily:   totalGainEurDaily,
    total_gain_eur_year_end: totalGainEurYearEnd,
    fx_rates: { year_end_brl_eur: yearEndBrlEur, year_end_usd_eur: yearEndUsdEur },
  })
})

// GET /api/reports/:year
router.get('/:year', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const year = parseInt(req.params.year, 10)
  if (isNaN(year) || year < 2000 || year > 2100) {
    res.status(400).json({ error: 'Ano inválido' }); return
  }

  const endOfYear = `${year}-12-31`

  // Get all user assets upfront — contributions filter through these IDs
  const { data: assets, error: ae } = await supabaseAdmin
    .from('assets')
    .select('id, code, name, asset_type, currency, exchange')
    .eq('user_id', userId)
    .eq('active', true)

  if (ae) { res.status(500).json({ error: ae.message }); return }

  const assetIds = (assets ?? []).map(a => a.id)
  if (assetIds.length === 0) {
    res.json({ year, sells: [], income: [], positions: [], totalGainLoss: 0, totalIncome: 0 }); return
  }

  const assetMap = Object.fromEntries((assets ?? []).map(a => [a.id, a]))

  // Contributions in the year (for sells and income)
  const { data: contribs, error: ce } = await supabaseAdmin
    .from('contributions')
    .select('id, asset_id, type, date, quantity, price_orig, value_brl, description')
    .in('asset_id', assetIds)
    .gte('date', `${year}-01-01`)
    .lte('date', endOfYear)
    .order('date')

  if (ce) { res.status(500).json({ error: ce.message }); return }

  // All buys up to end of year — for avg cost basis
  const { data: allBuys, error: be } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, quantity, value_brl, price_orig, date')
    .in('asset_id', assetIds)
    .eq('type', 'buy')
    .lte('date', endOfYear)
    .order('date')

  if (be) { res.status(500).json({ error: be.message }); return }

  // Build cost basis map: asset_id -> { totalQty, totalCost }
  const basis: Record<number, { totalQty: number; totalCost: number }> = {}
  for (const b of (allBuys ?? [])) {
    if (!basis[b.asset_id]) basis[b.asset_id] = { totalQty: 0, totalCost: 0 }
    const qty  = b.quantity ?? 1
    const cost = b.value_brl ?? (b.price_orig ?? 0) * qty
    basis[b.asset_id].totalQty  += qty
    basis[b.asset_id].totalCost += cost
  }

  // Sells in the year — gain/loss using avg cost (only ticker assets qualify for capital gains)
  const sells = (contribs ?? []).filter(c => c.type === 'sell' && assetMap[c.asset_id]?.asset_type === 'ticker').map(c => {
    const b = basis[c.asset_id] ?? { totalQty: 0, totalCost: 0 }
    const avgCostPerUnit = b.totalQty > 0 ? b.totalCost / b.totalQty : 0
    const qty         = c.quantity ?? 1
    const costBasis   = avgCostPerUnit * qty
    const saleValue   = c.value_brl ?? (c.price_orig ?? 0) * qty
    const gainLoss    = saleValue - costBasis
    const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : null
    const asset = assetMap[c.asset_id]
    return {
      id: c.id, date: c.date, asset_id: c.asset_id,
      code: asset?.code ?? '', name: asset?.name ?? '',
      qty, sale_value_brl: saleValue, cost_basis_brl: costBasis,
      gain_loss_brl: gainLoss, gain_loss_pct: gainLossPct,
    }
  })

  // Income in the year — manual entries
  const incomeManual = (contribs ?? []).filter(c => c.type === 'income').map(c => {
    const asset = assetMap[c.asset_id]
    return {
      id: c.id, date: c.date, asset_id: c.asset_id,
      code: asset?.code ?? '', name: asset?.name ?? '',
      value_brl: c.value_brl ?? 0,
      description: c.description ?? '',
      source: 'manual' as const,
    }
  })

  // Auto-fetched dividends
  const { data: autoDiv } = await supabaseAdmin
    .from('dividends')
    .select('id, asset_id, ex_date, pay_date, amount_brl, dividend_type')
    .in('asset_id', assetIds)
    .eq('user_id', userId)
    .gte('ex_date', `${year}-01-01`)
    .lte('ex_date', endOfYear)
    .order('ex_date')

  const incomeAuto = (autoDiv ?? []).map(d => {
    const asset = assetMap[d.asset_id]
    return {
      id: d.id, date: d.ex_date, asset_id: d.asset_id,
      code: asset?.code ?? '', name: asset?.name ?? '',
      value_brl: d.amount_brl ?? 0,
      description: d.dividend_type,
      source: 'auto' as const,
    }
  })

  const income = [...incomeManual, ...incomeAuto]
    .sort((a, b) => a.date.localeCompare(b.date))

  // All contributions up to end of year — for position calculation
  const { data: allContribs, error: ace } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, type, quantity, value_brl, price_orig')
    .in('asset_id', assetIds)
    .lte('date', endOfYear)

  if (ace) { res.status(500).json({ error: ace.message }); return }

  const posMap: Record<number, { qty: number; cost: number }> = {}
  for (const c of (allContribs ?? [])) {
    if (c.type === 'income') continue
    if (!posMap[c.asset_id]) posMap[c.asset_id] = { qty: 0, cost: 0 }
    const qty  = c.quantity ?? 1
    const cost = c.value_brl ?? (c.price_orig ?? 0) * qty
    if (c.type === 'buy')  { posMap[c.asset_id].qty += qty; posMap[c.asset_id].cost += cost }
    if (c.type === 'sell') { posMap[c.asset_id].qty -= qty; posMap[c.asset_id].cost -= cost }
  }

  const positions = (assets ?? [])
    .map(a => {
      const p = posMap[a.id]
      if (!p || p.qty <= 0.000001) return null
      return { asset_id: a.id, code: a.code, name: a.name, asset_type: a.asset_type, currency: a.currency, exchange: a.exchange, qty: p.qty, cost_brl: p.cost }
    })
    .filter(Boolean)

  const totalGainLoss = sells.reduce((s, r) => s + r.gain_loss_brl, 0)
  const totalIncome   = income.reduce((s, r) => s + r.value_brl, 0)

  res.json({ year, sells, income, positions, totalGainLoss, totalIncome })
})

export default router
