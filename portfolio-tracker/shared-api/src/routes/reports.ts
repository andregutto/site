import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { cache } from '../lib/cache.js'

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

const BROKER_INFO: Record<string, { institution: string; address: string; country: string; registration: string }> = {
  'Interactive Brokers': {
    institution:  'Interactive Brokers Ireland Ltd',
    address:      'Two Harbourmaster Place, IFSC, Dublin 1, Ireland',
    country:      'Irlande',
    registration: '',
  },
  'XP': {
    institution:  'XP Investimentos CCTVM S/A',
    address:      'Av. Chedid Jafet, 75 — Vila Olímpia, São Paulo, SP — Brésil',
    country:      'Brésil',
    registration: '02.332.886/0011-03',
  },
  'BTG': {
    institution:  'Banco BTG Pactual S.A.',
    address:      'Av. Brigadeiro Faria Lima, 3477 — Itaim Bibi, São Paulo, SP — Brésil',
    country:      'Brésil',
    registration: '30.306.294/0001-45',
  },
  'C6': {
    institution:  'Banco C6 S.A.',
    address:      'Al. Joaquim Eugênio de Lima, 680 — Jardim Paulista, São Paulo, SP — Brésil',
    country:      'Brésil',
    registration: '31.872.495/0001-72',
  },
  'Nubank': {
    institution:  'Nu Pagamentos S.A.',
    address:      'Rua Capote Valente, 39 — Pinheiros, São Paulo, SP — Brésil',
    country:      'Brésil',
    registration: '18.236.120/0001-58',
  },
  'Rico': {
    institution:  'Rico Investimentos CTVM S.A. — Grupo XP',
    address:      'Av. Chedid Jafet, 75 — Vila Olímpia, São Paulo, SP — Brésil',
    country:      'Brésil',
    registration: '02.332.886/0011-03',
  },
  'Clear': {
    institution:  'Clear Corretora CTVM S.A. — Grupo XP',
    address:      'Av. Chedid Jafet, 75 — Vila Olímpia, São Paulo, SP — Brésil',
    country:      'Brésil',
    registration: '02.332.886/0001-03',
  },
  'Itaú': {
    institution:  'Itaú Unibanco S.A.',
    address:      'Praça Alfredo Egydio de Souza Aranha, 100 — Jabaquara, São Paulo, SP — Brésil',
    country:      'Brésil',
    registration: '60.701.190/0001-04',
  },
  'Bradesco': {
    institution:  'Banco Bradesco S.A.',
    address:      'Núcleo Cidade de Deus, s/n — Vila Yara, Osasco, SP — Brésil',
    country:      'Brésil',
    registration: '60.746.948/0001-12',
  },
  'Santander': {
    institution:  'Banco Santander (Brasil) S.A.',
    address:      'Av. Presidente Juscelino Kubitschek, 2041 — Itaim Bibi, São Paulo, SP — Brésil',
    country:      'Brésil',
    registration: '90.400.888/0001-42',
  },
  'Banco do Brasil': {
    institution:  'Banco do Brasil S.A.',
    address:      'SBS — Quadra 1 — Bloco G — Lote 32, Brasília, DF — Brésil',
    country:      'Brésil',
    registration: '00.000.000/0001-91',
  },
  'Caixa': {
    institution:  'Caixa Econômica Federal',
    address:      'SBS — Quadra 4 — Lotes 3/4, Brasília, DF — Brésil',
    country:      'Brésil',
    registration: '00.360.305/0001-04',
  },
  'Banco Inter': {
    institution:  'Banco Inter S.A.',
    address:      'Av. José Cândido da Silveira, 2000 — Horto, Belo Horizonte, MG — Brésil',
    country:      'Brésil',
    registration: '00.416.968/0001-01',
  },
  'Avenue': {
    institution:  'Avenue Securities LLC',
    address:      '125 E. Palmetto Park Rd., Suite 105, Boca Raton, FL 33432 — États-Unis',
    country:      'États-Unis',
    registration: '',
  },
  'Genial': {
    institution:  'Genial Investimentos CCTVM S.A.',
    address:      'Av. Brigadeiro Faria Lima, 3400 — Itaim Bibi, São Paulo, SP — Brésil',
    country:      'Brésil',
    registration: '27.652.684/0001-62',
  },
  // ── Corretoras / Banques françaises ─────────────────────────────────────
  'Boursorama': {
    institution:  'Boursorama S.A.',
    address:      '18 quai du Président Roosevelt, 92130 Issy-les-Moulineaux, France',
    country:      'France',
    registration: '351 058 444',
  },
  'Bourse Direct': {
    institution:  'Bourse Direct S.A.',
    address:      '253 rue de Saint-Honoré, 75001 Paris, France',
    country:      'France',
    registration: '753 127 736',
  },
  'Crédit Agricole': {
    institution:  'Crédit Agricole S.A.',
    address:      '12 place des États-Unis, 92120 Montrouge, France',
    country:      'France',
    registration: '784 608 416',
  },
  'Fortuneo': {
    institution:  'Fortuneo Banque',
    address:      '1 place Copernic, 92098 Paris La Défense Cedex, France',
    country:      'France',
    registration: '514 076 509',
  },
  'BNP Paribas': {
    institution:  'BNP Paribas S.A.',
    address:      '16 boulevard des Italiens, 75009 Paris, France',
    country:      'France',
    registration: '662 042 449',
  },
  'Société Générale': {
    institution:  'Société Générale S.A.',
    address:      '29 boulevard Haussmann, 75009 Paris, France',
    country:      'France',
    registration: '552 120 222',
  },
  "Caisse d'Épargne": {
    institution:  "Caisse d'Épargne et de Prévoyance",
    address:      '50 avenue Pierre Mendès France, 75013 Paris, France',
    country:      'France',
    registration: '778 282 066',
  },
  'LCL': {
    institution:  'LCL — Le Crédit Lyonnais S.A.',
    address:      '20 avenue de Paris, 94811 Villejuif Cedex, France',
    country:      'France',
    registration: '954 509 741',
  },
  'Banque Postale': {
    institution:  'La Banque Postale',
    address:      '115 rue de Sèvres, 75275 Paris Cedex 06, France',
    country:      'France',
    registration: '421 100 645',
  },
  // ── Courtiers européens ──────────────────────────────────────────────────
  '212 Trading': {
    institution:  'Trading 212 Markets Ltd',
    address:      '3 Kallipoleos Street, Limassol 3036, Chypre',
    country:      'Chypre',
    registration: 'HE322334',
  },
  'Trade Republic': {
    institution:  'Trade Republic Bank GmbH',
    address:      'Kastanienallee 32, 10435 Berlin, Allemagne',
    country:      'Allemagne',
    registration: 'DE 324 929 578',
  },
  'Degiro': {
    institution:  'DEGIRO B.V.',
    address:      'Rembrandt Tower, Amstelplein 1, 1096 HA Amsterdam, Pays-Bas',
    country:      'Pays-Bas',
    registration: '59555939',
  },
  'Revolut': {
    institution:  'Revolut Bank UAB',
    address:      'Konstitucijos ave. 21B, Vilnius 08130, Lituanie',
    country:      'Lituanie',
    registration: '304580906',
  },
  'Wise': {
    institution:  'Wise Europe SA',
    address:      'Square de Meeûs 35, 1000 Bruxelles, Belgique',
    country:      'Belgique',
    registration: '0713.629.988',
  },
  'Saxo Bank': {
    institution:  'Saxo Bank A/S',
    address:      'Philip Heymans Allé 15, 2900 Hellerup, Danemark',
    country:      'Danemark',
    registration: '15731249',
  },
  'Swissquote': {
    institution:  'Swissquote Bank Ltd',
    address:      'Chemin de la Crêtaux 33, 1196 Gland, Suisse',
    country:      'Suisse',
    registration: 'CHE-113.540.212',
  },
  // ── Banques portugaises ──────────────────────────────────────────────────
  'Millennium BCP': {
    institution:  'Banco Comercial Português, S.A.',
    address:      'Praça D. João I, 28, 4000-295 Porto, Portugal',
    country:      'Portugal',
    registration: '501 525 882',
  },
  'Banco BPI': {
    institution:  'Banco BPI, S.A.',
    address:      'Rua Tenente Valadim, 284, 4100-476 Porto, Portugal',
    country:      'Portugal',
    registration: '501 214 534',
  },
  'Caixa Geral de Depósitos': {
    institution:  'Caixa Geral de Depósitos, S.A.',
    address:      'Av. João XXI, 63, 1000-300 Lisboa, Portugal',
    country:      'Portugal',
    registration: '500 960 046',
  },
  'Banco Montepio': {
    institution:  'Banco Montepio Geral, S.A.',
    address:      'Rua Áurea, 219-241, 1100-060 Lisboa, Portugal',
    country:      'Portugal',
    registration: '500 702 409',
  },
  'ActivoBank': {
    institution:  'ActivoBank, S.A.',
    address:      'Rua Augusta, 84, 1100-053 Lisboa, Portugal',
    country:      'Portugal',
    registration: '501 680 729',
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
  if (v.includes('nubank') || v === 'nu') return 'Nubank'
  if (v.includes('rico')) return 'Rico'
  if (v.includes('clear')) return 'Clear'
  if (v.includes('itaú') || v.includes('itau')) return 'Itaú'
  if (v.includes('bradesco')) return 'Bradesco'
  if (v.includes('santander')) return 'Santander'
  if (v.includes('banco do brasil') || v === 'bb') return 'Banco do Brasil'
  if (v.includes('caixa geral') || v === 'cgd') return 'Caixa Geral de Depósitos'
  if (v.includes('caixa econômica') || v.includes('caixa economica') || v === 'cef') return 'Caixa'
  if (v.includes('inter') && !v.includes('interactive')) return 'Banco Inter'
  if (v.includes('avenue')) return 'Avenue'
  if (v.includes('genial')) return 'Genial'
  // francesas
  if (v.includes('boursorama') || v === 'bourso') return 'Boursorama'
  if (v.includes('bourse direct')) return 'Bourse Direct'
  if (v.includes('crédit agricole') || v.includes('credit agricole') || v === 'ca') return 'Crédit Agricole'
  if (v.includes('fortuneo')) return 'Fortuneo'
  if (v.includes('bnp')) return 'BNP Paribas'
  if (v.includes('société générale') || v.includes('societe generale') || v === 'sg') return 'Société Générale'
  if (v.includes("caisse d'épargne") || v.includes('caisse epargne') || v === 'ce') return "Caisse d'Épargne"
  if (v === 'lcl' || v.includes('crédit lyonnais') || v.includes('credit lyonnais')) return 'LCL'
  if (v.includes('banque postale') || v === 'la banque postale') return 'Banque Postale'
  // europeias
  if (v.includes('212') || v.includes('trading 212') || v.includes('trading212')) return '212 Trading'
  if (v.includes('trade republic') || v.includes('traderepublic')) return 'Trade Republic'
  if (v.includes('degiro')) return 'Degiro'
  if (v.includes('revolut')) return 'Revolut'
  if (v.includes('wise') || v.includes('transferwise')) return 'Wise'
  if (v.includes('saxo')) return 'Saxo Bank'
  if (v.includes('swissquote')) return 'Swissquote'
  // portuguesas
  if (v.includes('millennium') || v.includes('bcp')) return 'Millennium BCP'
  if (v === 'bpi' || v.includes('banco bpi')) return 'Banco BPI'
  if (v.includes('montepio')) return 'Banco Montepio'
  if (v.includes('activobank') || v.includes('activo bank')) return 'ActivoBank'
  return exchange
}

function mapEventType(dividendType: string | null, description: string | null): EventType {
  const raw = (dividendType ?? description ?? '').toLowerCase().trim()
  return EVENT_TYPE_MAP[raw] ?? 'DIVIDEND'
}

// Frankfurter (ECB) — free, no key, BRL+USD in one call
async function fetchYearFxMaps(
  year: number,
): Promise<{ brlEur: Record<string, number>; usdEur: Record<string, number> }> {
  const TTL = 24 * 60 * 60 * 1000
  type FrankRates = Record<string, { BRL?: number; USD?: number }>
  const raw = await cache.getOrFetch(
    `fx_frankfurter_${year}`, TTL,
    async () => {
      const url = `https://api.frankfurter.app/${year}-01-01..${year}-12-31?from=EUR&to=BRL,USD`
      const r = await fetch(url)
      if (!r.ok) throw new Error(`Frankfurter ${r.status}`)
      return (await r.json() as { rates: FrankRates }).rates
    },
  ) as FrankRates
  const brlEur: Record<string, number> = {}
  const usdEur: Record<string, number> = {}
  for (const [date, rates] of Object.entries(raw ?? {})) {
    if (rates.BRL && rates.BRL > 0) brlEur[date] = 1 / rates.BRL
    if (rates.USD && rates.USD > 0) usdEur[date] = 1 / rates.USD
  }
  return { brlEur, usdEur }
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
    .select('id, code, name, asset_type, currency, exchange, country, fi_start_date, fi_type, fi_rate, fi_spread')
    .eq('user_id', userId)

  if (ae) { res.status(500).json({ error: ae.message }); return }
  const assetMap = Object.fromEntries((assets ?? []).map(a => [a.id, a]))
  const assetIds = Object.keys(assetMap).map(Number)

  if (assetIds.length === 0) {
    res.json({
      year, events: [], sections_daily: [], sections_year_end: [],
      totals_daily: { dividends_eur: 0, interests_eur: 0, credit_eur: 0 },
      totals_year_end: { dividends_eur: 0, interests_eur: 0, credit_eur: 0 },
      comparison: {
        daily: { dividends_eur: 0, interests_eur: 0, credit_eur: 0, total_eur: 0 },
        year_end: { dividends_eur: 0, interests_eur: 0, credit_eur: 0, total_eur: 0 },
        recommended: 'daily',
        advantage_eur: 0,
      },
      accounts: [],
      capital_gains: [],
      total_gain_eur_daily: 0,
      total_gain_eur_year_end: 0,
      fx_rates: { year_end_brl_eur: 0, year_end_usd_eur: 0 },
    })
    return
  }

  let divRows: Array<{ id: unknown; asset_id: unknown; ex_date: unknown; amount_brl: unknown; amount_total?: unknown; currency: unknown; dividend_type: unknown; tax_withheld?: unknown; country_of_dividend?: unknown }> | null = null
  {
    const { data: d1, error: e1 } = await supabaseAdmin
      .from('dividends')
      .select('id, asset_id, ex_date, amount_brl, amount_total, currency, dividend_type, tax_withheld, country_of_dividend')
      .in('asset_id', assetIds)
      .eq('user_id', userId)
      .gte('ex_date', startDate)
      .lte('ex_date', endDate)
      .order('ex_date')
    if (e1 && e1.message?.includes('does not exist')) {
      const { data: d2, error: e2 } = await supabaseAdmin
        .from('dividends')
        .select('id, asset_id, ex_date, amount_brl, amount_total, currency, dividend_type')
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
    const fx = await fetchYearFxMaps(year)
    brlEurMap = fx.brlEur
    usdEurMap = fx.usdEur
  } catch (err) {
    console.error('FX fetch error (Frankfurter):', err)
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

  // Fetch user profile early — needed for saida_fiscal_brasil in FI interest calc
  const { data: { user: profileUser } } = await supabaseAdmin.auth.admin.getUserById(userId)
  const taxCountry  = (profileUser?.user_metadata?.tax_country  ?? '') as string
  const saidaFiscal = (taxCountry !== '' && taxCountry !== 'BR') ||
                      ((profileUser?.user_metadata?.saida_fiscal_brasil ?? false) as boolean)

  const events: TaxEvent[] = []
  const skippedAssets: string[] = []

  for (const d of (divRows ?? [])) {
    const asset = assetMap[d.asset_id as number]
    if (!asset) continue
    const currency     = (d.currency ?? asset.currency ?? 'BRL') as string
    const amountOrig   = (d.amount_total != null ? d.amount_total : d.amount_brl) as number
    const grossAmount  = currency !== 'BRL' && amountOrig > 0 ? amountOrig : (d.amount_brl ?? 0) as number
    if (grossAmount <= 0) continue

    const country   = normaliseCountry((d.country_of_dividend ?? TICKER_COUNTRY_OVERRIDES[asset.code as string] ?? asset.country) as string | null)
    if (country === 'OTHER') {
      skippedAssets.push(`${asset.code as string} (country: ${((d.country_of_dividend ?? asset.country) as string | null) ?? 'null'})`)
      continue
    }
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
    if (country === 'OTHER') {
      skippedAssets.push(`${asset.code as string} (country: ${(asset.country as string | null) ?? 'null'})`)
      continue
    }
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

  // ── FI sell (redemption) interest ─────────────────────────────────────────
  // French "régime de l'encaissement" — taxable only when actually received
  {
    const fiAssetIds = (assets ?? [])
      .filter(a => (a.asset_type as string) === 'fixed_income')
      .map(a => a.id)

    if (fiAssetIds.length > 0) {
      const [{ data: fiBuys }, { data: fiSells }] = await Promise.all([
        supabaseAdmin.from('contributions')
          .select('asset_id, quantity, value_brl')
          .in('asset_id', fiAssetIds).eq('user_id', userId).eq('type', 'buy')
          .order('date'),
        supabaseAdmin.from('contributions')
          .select('id, asset_id, date, quantity, value_brl, tax_withheld')
          .in('asset_id', fiAssetIds).eq('user_id', userId).eq('type', 'sell')
          .gte('date', startDate).lte('date', endDate).order('date'),
      ])

      const fiCostBasis: Record<number, { totalQty: number; totalCost: number }> = {}
      for (const b of (fiBuys ?? [])) {
        const aid = b.asset_id as number
        if (!fiCostBasis[aid]) fiCostBasis[aid] = { totalQty: 0, totalCost: 0 }
        fiCostBasis[aid].totalQty  += (b.quantity  ?? 0) as number
        fiCostBasis[aid].totalCost += (b.value_brl ?? 0) as number
      }

      function getBrIrRate(fiStartDate: string, sellDate: string): number {
        if (saidaFiscal) return 0.15
        const days = Math.floor((new Date(sellDate).getTime() - new Date(fiStartDate).getTime()) / 86400000)
        if (days <= 180) return 0.225
        if (days <= 360) return 0.20
        if (days <= 720) return 0.175
        return 0.15
      }

      for (const sell of (fiSells ?? [])) {
        const asset = assetMap[sell.asset_id as number]
        if (!asset) continue
        const country = normaliseCountry(asset.country as string | null)
        if (country === 'OTHER') {
          skippedAssets.push(`${asset.code as string} (country: ${(asset.country as string | null) ?? 'null'})`)
          continue
        }

        const taxWithheld = (sell.tax_withheld ?? 0) as number
        const saleValue   = (sell.value_brl    ?? 0) as number

        const fiStart = (asset as { fi_start_date?: string | null }).fi_start_date ?? startDate
        const irRate  = getBrIrRate(fiStart, sell.date as string)

        let grossInterest: number
        let withheld: number
        if (taxWithheld > 0) {
          // IRF available: derive gross from tax withheld (avoids broken cost-basis for partial redemptions)
          grossInterest = taxWithheld / irRate
          withheld = taxWithheld
        } else {
          // Fallback: CDI-based estimation when IRF not recorded (quantity-based cost-basis
          // breaks for FI because quantity=1 per transaction regardless of redemption size)
          const AVG_CDI_BY_YEAR: Record<number, number> = {
            2020: 0.0265, 2021: 0.0590, 2022: 0.1265,
            2023: 0.1328, 2024: 0.1040, 2025: 0.1290,
          }
          const sellYear = new Date(sell.date as string).getFullYear()
          const avgCDI = AVG_CDI_BY_YEAR[sellYear] ?? 0.12
          const fiRatePct = ((asset as { fi_rate?: number | null }).fi_rate ?? 100) / 100
          const calDays = Math.floor((new Date(sell.date as string).getTime() - new Date(fiStart).getTime()) / 86400000)
          const bizDays = Math.round(calDays * 252 / 365)
          const accumReturn = (Math.pow(1 + avgCDI, bizDays / 252) - 1) * fiRatePct
          // saleValue = principal × (1 + accumReturn) → interest = saleValue × r / (1 + r)
          grossInterest = accumReturn > 0 && saleValue > 0 ? saleValue * accumReturn / (1 + accumReturn) : 0
          withheld = grossInterest * irRate
        }
        if (grossInterest <= 0) continue

        const broker = normaliseBroker(asset.exchange as string | null)
        const fxD  = getNearestRate(brlEurMap, sell.date as string, fallbackBrlEur)
        const fxYE = yearEndBrlEur || fallbackBrlEur

        events.push({
          id:                        `fi_${sell.id as string}`,
          date:                      sell.date as string,
          asset_code:                asset.code as string,
          asset_name:                asset.name as string,
          asset_type:                asset.asset_type as string,
          event_type:                'INTEREST',
          form_type:                 '2TR',
          country,
          broker,
          currency:                  'BRL',
          gross_amount:              grossInterest,
          tax_withheld_src:          withheld,
          gross_eur_daily:           grossInterest * fxD,
          tax_withheld_eur_daily:    withheld * fxD,
          gross_eur_year_end:        grossInterest * fxYE,
          tax_withheld_eur_year_end: withheld * fxYE,
          fx_rate_daily:             fxD,
          fx_rate_year_end:          fxYE,
        })
      }
    }
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

  // Build 3916 accounts — user's saved institution_data first, BROKER_INFO as fallback
  const savedInstitutionData = (profileUser?.user_metadata?.institution_data ?? {}) as Record<string, {
    official_name?: string; address?: string; country?: string
    account_number?: string; iban?: string; swift?: string
  }>

  const COUNTRY_TO_FR: Record<string, string> = {
    Brasil: 'Brésil', EUA: 'États-Unis', França: 'France', Irlanda: 'Irlande',
    'Reino Unido': 'Royaume-Uni', Alemanha: 'Allemagne', Portugal: 'Portugal', Suíça: 'Suisse',
    Holanda: 'Pays-Bas', Bélgica: 'Belgique', Lituânia: 'Lituanie', Chipre: 'Chypre',
    Dinamarca: 'Danemark', Bulgária: 'Bulgarie', Luxemburgo: 'Luxembourg',
  }

  const brokersSeen = new Set([
    ...events.map(e => e.broker),
    ...(assets ?? []).map(a => normaliseBroker(a.exchange as string | null)),
  ])
  const accounts = Array.from(brokersSeen)
    .filter(b => b !== 'Outros')
    .map(b => {
      const userInst = savedInstitutionData[b]
      if (userInst?.official_name) {
        return {
          broker:         b,
          institution:    userInst.official_name,
          address:        userInst.address ?? '',
          country:        COUNTRY_TO_FR[userInst.country ?? ''] ?? userInst.country ?? '',
          account_number: userInst.account_number ?? '',
          status:         'Ouvert',
          system_filled:  false,
        }
      }
      if (BROKER_INFO[b]) {
        return {
          broker:         b,
          institution:    BROKER_INFO[b].institution,
          address:        BROKER_INFO[b].address,
          country:        BROKER_INFO[b].country,
          account_number: '',
          status:         'Ouvert',
          system_filled:  true,
        }
      }
      return null
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)

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
    skipped_assets: [...new Set(skippedAssets)],
  })
})

// ─── Brazil Tax Report ────────────────────────────────────────────────────────

const CARNE_LEAO_TABLE = [
  { limite: 2259.20,  rate: 0,     deducao: 0      },
  { limite: 2826.65,  rate: 0.075, deducao: 169.44 },
  { limite: 3751.05,  rate: 0.15,  deducao: 381.44 },
  { limite: 4664.68,  rate: 0.225, deducao: 662.77 },
  { limite: Infinity, rate: 0.275, deducao: 896.00 },
]
function calcCarneLeao(base: number): { aliquota: number; deducao: number; ir: number } {
  for (const f of CARNE_LEAO_TABLE) {
    if (base <= f.limite) return { aliquota: f.rate, deducao: f.deducao, ir: Math.max(0, Math.round((base * f.rate - f.deducao) * 100) / 100) }
  }
  return { aliquota: 0.275, deducao: 896, ir: 0 }
}

function pgdiCode(asset: { asset_type: string; country: string | null; code: string; class_name?: string }): { grupo: string; codigo: string; descricao: string } {
  const country = normaliseCountry(asset.country)
  const cls     = (asset.class_name ?? '').toLowerCase()
  const code    = (asset.code ?? '').toUpperCase()
  if (asset.asset_type === 'fixed_income') {
    if (code.includes('LCI') || cls.includes('lci')) return { grupo: '04', codigo: '03', descricao: 'Letra de Crédito Imobiliário (LCI)' }
    if (code.includes('LCA') || cls.includes('lca')) return { grupo: '04', codigo: '03', descricao: 'Letra de Crédito do Agronegócio (LCA)' }
    if (code.includes('NTN') || code.includes('TESOURO') || cls.includes('tesouro')) return { grupo: '04', codigo: '02', descricao: 'Título Público Federal (Tesouro Direto)' }
    return { grupo: '04', codigo: '02', descricao: 'CDB / Aplicação de Renda Fixa' }
  }
  if (asset.asset_type === 'manual') return { grupo: '99', codigo: '99', descricao: 'Outros bens — verificar no PGDI' }
  const isFII    = cls.includes('fii') || cls.includes('imobiliário') || cls.includes('imobiliario')
  const isETF    = cls.includes('etf') || cls.includes('índice') || cls.includes('indice')
  const isCrypto = cls.includes('cripto') || cls.includes('crypto') || cls.includes('bitcoin')
  if (isCrypto) return { grupo: '08', codigo: '01', descricao: 'Criptoativo / Ativo Virtual' }
  if (country === 'BR') {
    if (isFII) return { grupo: '07', codigo: '03', descricao: 'Fundo de Investimento Imobiliário (FII)' }
    if (isETF) return { grupo: '07', codigo: '09', descricao: 'ETF / Fundo de Índice (Bolsa BR)' }
    return { grupo: '03', codigo: '01', descricao: 'Ações em Bolsa de Valores — Brasil (B3)' }
  }
  if (isFII || isETF) return { grupo: '07', codigo: '09', descricao: 'ETF / Fundo no Exterior' }
  return { grupo: '03', codigo: '09', descricao: 'Ações de Companhia Estrangeira' }
}

// GET /api/reports/brazil/:year
router.get('/brazil/:year', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const year = parseInt(req.params.year, 10)
  if (isNaN(year) || year < 2000 || year > 2100) { res.status(400).json({ error: 'Ano inválido' }); return }

  const startDate = `${year}-01-01`, endDate = `${year}-12-31`, prevEnd = `${year - 1}-12-31`

  const { data: assets, error: ae } = await supabaseAdmin
    .from('assets').select('id, code, name, asset_type, currency, exchange, country, asset_classes(name)').eq('user_id', userId)
  if (ae) { res.status(500).json({ error: ae.message }); return }

  const assetMap = Object.fromEntries(
    (assets ?? []).map(a => [a.id, { ...a, class_name: ((a.asset_classes as unknown) as { name: string } | null)?.name ?? '' }])
  )
  const assetIds = Object.keys(assetMap).map(Number)
  const empty = { year, bens_direitos: [], rendimentos_isentos: [], tributacao_exclusiva: [], ir_retido_total: 0, renda_variavel: [], total_ganho_rv: 0, total_perda_rv: 0, total_darf_rv: 0, carryover_final: 0, carne_leao: [], total_carne_leao: 0, total_isentos: 0, total_exclusiva: 0 }
  if (assetIds.length === 0) { res.json(empty); return }

  const { data: allContribs } = await supabaseAdmin.from('contributions')
    .select('id, asset_id, date, type, quantity, value_brl, description, tax_withheld')
    .in('asset_id', assetIds).order('date')

  const { data: dividends } = await supabaseAdmin.from('dividends')
    .select('id, asset_id, ex_date, amount_brl, dividend_type, tax_withheld')
    .in('asset_id', assetIds).eq('user_id', userId)
    .gte('ex_date', startDate).lte('ex_date', endDate).order('ex_date')

  const contribs = allContribs ?? []
  const divs     = dividends ?? []

  // Bens e Direitos
  const stateAt = (cutoff: string) => {
    const m: Record<number, { qty: number; cost: number }> = {}
    for (const c of contribs) {
      if ((c.date as string) > cutoff) break
      const id = c.asset_id as number
      if (!m[id]) m[id] = { qty: 0, cost: 0 }
      if (c.type === 'buy') { m[id].qty += (c.quantity as number) ?? 0; m[id].cost += (c.value_brl as number) ?? 0 }
      else if (c.type === 'sell') {
        const b = m[id]; const qty = (c.quantity as number) ?? 0
        if (b.qty > 0) { b.cost -= (b.cost / b.qty) * qty; b.qty -= qty }
      }
    }
    return m
  }
  const stateYE = stateAt(endDate), statePrev = stateAt(prevEnd)
  const bens_direitos = Object.entries(stateYE).filter(([, s]) => s.qty > 0.0001 && s.cost > 0).map(([idStr, s]) => {
    const id = Number(idStr); const asset = assetMap[id]; const prev = statePrev[id] ?? { qty: 0, cost: 0 }
    const pgdi = pgdiCode(asset as { asset_type: string; country: string | null; code: string; class_name?: string })
    return { asset_id: id, code: asset.code, name: asset.name, pgdi_grupo: pgdi.grupo, pgdi_codigo: pgdi.codigo, pgdi_descricao: pgdi.descricao, qty: Math.round(s.qty * 1e6) / 1e6, cost_brl: Math.round(s.cost * 100) / 100, situacao_anterior: Math.round(prev.cost * 100) / 100, situacao_atual: Math.round(s.cost * 100) / 100, discriminacao: `${Number(s.qty.toFixed(4))} ${asset.asset_type !== 'fixed_income' ? 'cotas/ações' : ''} ${asset.code} — ${asset.name}`.trim() }
  }).sort((a, b) => a.pgdi_grupo.localeCompare(b.pgdi_grupo) || a.code.localeCompare(b.code))

  // Rendimentos Isentos + Tributação Exclusiva
  type RendItem = { id: string; date: string; asset_code: string; asset_name: string; valor: number; ir_retido: number }
  const isBucket: Record<string, { codigo: string; descricao: string; items: RendItem[] }> = {}
  const exBucket: Record<string, { codigo: string; descricao: string; items: RendItem[] }> = {}
  const push = (b: typeof isBucket, cod: string, desc: string, item: RendItem) => { if (!b[cod]) b[cod] = { codigo: cod, descricao: desc, items: [] }; b[cod].items.push(item) }

  for (const d of divs) {
    const asset = assetMap[d.asset_id as number]; if (!asset) continue
    const country = normaliseCountry(asset.country as string | null)
    const dType   = ((d.dividend_type as string) ?? 'dividend').toLowerCase()
    const item: RendItem = { id: String(d.id), date: d.ex_date as string, asset_code: asset.code as string, asset_name: asset.name as string, valor: (d.amount_brl as number) ?? 0, ir_retido: (d.tax_withheld as number) ?? 0 }
    if (dType === 'jcp')        push(exBucket, '10', 'Juros sobre Capital Próprio (JCP)', item)
    else if (dType === 'fii_income') push(isBucket, '26', 'Rendimentos de Fundos de Investimento Imobiliário', item)
    else if (country === 'BR')  push(isBucket, '09', 'Lucros e dividendos recebidos', item)
    // foreign → carnê-leão
  }
  for (const c of contribs) {
    if (c.type !== 'income' || (c.date as string) < startDate || (c.date as string) > endDate) continue
    const asset = assetMap[c.asset_id as number]; if (!asset) continue
    const desc  = ((c.description as string) ?? '').toLowerCase()
    const item: RendItem = { id: `c${c.id}`, date: c.date as string, asset_code: asset.code as string, asset_name: asset.name as string, valor: (c.value_brl as number) ?? 0, ir_retido: (c.tax_withheld as number) ?? 0 }
    if (desc === 'lci' || desc === 'lca') push(isBucket, '12', desc === 'lci' ? 'Rendimentos de LCI (isentos)' : 'Rendimentos de LCA (isentos)', item)
    else if (desc === 'poupanca') push(isBucket, '12', 'Rendimentos de poupança', item)
    else push(exBucket, '06', 'Rendimentos de aplicações financeiras (CDB, RF)', item)
  }

  const sumV = (items: RendItem[]) => items.reduce((s, i) => s + i.valor, 0)
  const sumI = (items: RendItem[]) => items.reduce((s, i) => s + i.ir_retido, 0)
  const rendimentos_isentos = Object.values(isBucket).map(g => ({ ...g, total: Math.round(sumV(g.items) * 100) / 100, ir_retido_total: Math.round(sumI(g.items) * 100) / 100 }))
  const tributacao_exclusiva = Object.values(exBucket).map(g => ({ ...g, total: Math.round(sumV(g.items) * 100) / 100, ir_retido_total: Math.round(sumI(g.items) * 100) / 100 }))
  const total_isentos   = rendimentos_isentos.reduce((s, g) => s + g.total, 0)
  const total_exclusiva = tributacao_exclusiva.reduce((s, g) => s + g.total, 0)
  const ir_retido_total = [...rendimentos_isentos, ...tributacao_exclusiva].reduce((s, g) => s + g.ir_retido_total, 0)

  // Renda Variável
  const getMes = (d: string) => d.slice(0, 7)
  const runBasis: Record<number, { qty: number; cost: number }> = {}
  const sellsInYear: Array<{ c: typeof contribs[0]; avgCost: number; gain: number }> = []
  for (const c of contribs) {
    const id = c.asset_id as number; const asset = assetMap[id]
    if (!asset || (asset.asset_type as string) !== 'ticker') continue
    if (!runBasis[id]) runBasis[id] = { qty: 0, cost: 0 }
    if (c.type === 'buy') { runBasis[id].qty += (c.quantity as number) ?? 0; runBasis[id].cost += (c.value_brl as number) ?? 0 }
    else if (c.type === 'sell') {
      const b = runBasis[id]; const qty = (c.quantity as number) ?? 0
      const avgCost = b.qty > 0 ? (b.cost / b.qty) * qty : 0
      if ((c.date as string) >= startDate && (c.date as string) <= endDate) sellsInYear.push({ c, avgCost, gain: ((c.value_brl as number) ?? 0) - avgCost })
      if (b.qty > 0) { b.cost -= (b.cost / b.qty) * qty; b.qty -= qty }
    }
  }
  const sellsByMes: Record<string, typeof sellsInYear> = {}
  for (const s of sellsInYear) { const m = getMes(s.c.date as string); if (!sellsByMes[m]) sellsByMes[m] = []; sellsByMes[m].push(s) }

  let carryover = 0
  const renda_variavel = Object.keys(sellsByMes).sort().map(mes => {
    const sells = sellsByMes[mes]; const totalVendas = sells.reduce((s, x) => s + ((x.c.value_brl as number) ?? 0), 0)
    const ganhoMes = sells.filter(x => x.gain > 0).reduce((s, x) => s + x.gain, 0)
    const perdaMes = sells.filter(x => x.gain < 0).reduce((s, x) => s + x.gain, 0)
    const isento = totalVendas <= 20000
    const carryoverAnterior = carryover
    let ganhoLiquido = 0, irDevido = 0, darf = 0
    if (!isento) {
      const bruto = ganhoMes + perdaMes + carryover
      ganhoLiquido = Math.max(0, bruto); carryover = Math.min(0, bruto)
      irDevido = Math.round(ganhoLiquido * 0.15 * 100) / 100; darf = Math.max(0, irDevido)
    } else { carryover += ganhoMes + perdaMes }
    return { mes, total_vendas: Math.round(totalVendas * 100) / 100, ganho_bruto: Math.round(ganhoMes * 100) / 100, perda_bruta: Math.round(perdaMes * 100) / 100, carryover_anterior: Math.round(carryoverAnterior * 100) / 100, ganho_liquido: Math.round(ganhoLiquido * 100) / 100, isento, aliquota: 0.15, ir_devido: irDevido, ir_retido: 0, darf_a_pagar: darf, operacoes: sells.map(s => ({ date: s.c.date as string, code: (assetMap[s.c.asset_id as number]?.code as string) ?? '?', qty: (s.c.quantity as number) ?? 0, sale_value: Math.round(((s.c.value_brl as number) ?? 0) * 100) / 100, cost_basis: Math.round(s.avgCost * 100) / 100, gain: Math.round(s.gain * 100) / 100 })) }
  })

  // Carnê-Leão
  const clByMes: Record<string, { brl: number; items: Array<{ date: string; asset_code: string; country: string; amount_brl: number }> }> = {}
  for (const d of divs.filter(d => normaliseCountry((assetMap[d.asset_id as number]?.country as string) ?? null) !== 'BR')) {
    const mes = getMes(d.ex_date as string); if (!clByMes[mes]) clByMes[mes] = { brl: 0, items: [] }
    const asset = assetMap[d.asset_id as number]; const amount = (d.amount_brl as number) ?? 0
    clByMes[mes].brl += amount
    clByMes[mes].items.push({ date: d.ex_date as string, asset_code: asset?.code as string ?? '?', country: normaliseCountry(asset?.country as string | null), amount_brl: Math.round(amount * 100) / 100 })
  }
  const carne_leao = Object.entries(clByMes).sort(([a], [b]) => a.localeCompare(b)).map(([mes, data]) => {
    const { aliquota, deducao, ir } = calcCarneLeao(data.brl)
    return { mes, dividendos_brl: Math.round(data.brl * 100) / 100, aliquota, deducao, ir_devido: ir, items: data.items }
  })

  res.json({
    year, bens_direitos, rendimentos_isentos, tributacao_exclusiva,
    ir_retido_total: Math.round(ir_retido_total * 100) / 100,
    total_isentos: Math.round(total_isentos * 100) / 100,
    total_exclusiva: Math.round(total_exclusiva * 100) / 100,
    renda_variavel,
    total_ganho_rv:  Math.round(renda_variavel.reduce((s, m) => s + Math.max(0, m.ganho_bruto + m.perda_bruta), 0) * 100) / 100,
    total_perda_rv:  Math.round(renda_variavel.reduce((s, m) => s + Math.min(0, m.ganho_bruto + m.perda_bruta), 0) * 100) / 100,
    total_darf_rv:   Math.round(renda_variavel.reduce((s, m) => s + m.darf_a_pagar, 0) * 100) / 100,
    carryover_final: Math.round(carryover * 100) / 100,
    carne_leao, total_carne_leao: Math.round(carne_leao.reduce((s, m) => s + m.ir_devido, 0) * 100) / 100,
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
