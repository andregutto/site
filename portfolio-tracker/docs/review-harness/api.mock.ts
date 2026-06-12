// ============================================================
// MOCK API para revisão visual de UI — dados de exemplo.
// Substitui o apiFetch real. NÃO usar em produção.
// ============================================================

function ym(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function addM(s: string, n: number) { const [y, m] = s.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return ym(d) }

const NOW_YM = '2026-06'
const INCEPTION = '2023-02'

// ---- série mensal de patrimônio (inception → hoje) ----
const MONTHS: string[] = []
{ let m = INCEPTION; while (m <= NOW_YM) { MONTHS.push(m); m = addM(m, 1) } }
const SERIES = MONTHS.map((month, i) => {
  const total = Math.round(118000 * Math.pow(1.012, i) + 3500 * i * 1.05)
  return { month, total }
})
SERIES[SERIES.length - 1].total = 284500

const CLASSES = [
  { id: 1, name: 'Ações Brasil',   color: '#1B4FD8', icon: '📊' },
  { id: 2, name: 'FIIs',           color: '#A36A52', icon: '🏢' },
  { id: 3, name: 'Renda Fixa',     color: '#C8B89A', icon: '🏦' },
  { id: 4, name: 'Cripto',         color: '#0D0D0D', icon: '💎' },
  { id: 5, name: 'Ações Exterior', color: '#E8A020', icon: '🌍' },
]

const ASSETS = [
  { id: 1,  code: 'BOVA11',  name: 'iShares Ibovespa',        cls: 1, value: 45200, orig: 45200, cur: 'BRL', hold: 380,    price: 118.95, inv: 39800 },
  { id: 2,  code: 'WEGE3',   name: 'WEG S.A.',                cls: 1, value: 38700, orig: 38700, cur: 'BRL', hold: 920,    price: 42.07,  inv: 31200 },
  { id: 3,  code: 'ITUB4',   name: 'Itaú Unibanco PN',        cls: 1, value: 24100, orig: 24100, cur: 'BRL', hold: 650,    price: 37.08,  inv: 21900 },
  { id: 4,  code: 'KNRI11',  name: 'Kinea Renda Imobiliária', cls: 2, value: 21300, orig: 21300, cur: 'BRL', hold: 132,    price: 161.36, inv: 20100 },
  { id: 5,  code: 'HGLG11',  name: 'CSHG Logística',          cls: 2, value: 23400, orig: 23400, cur: 'BRL', hold: 144,    price: 162.50, inv: 21800 },
  { id: 6,  code: 'MXRF11',  name: 'Maxi Renda',              cls: 2, value: 18300, orig: 18300, cur: 'BRL', hold: 1830,   price: 10.00,  inv: 18000 },
  { id: 7,  code: 'TESOURO IPCA+ 2035', name: 'Tesouro IPCA+ 2035', cls: 3, value: 32000, orig: 32000, cur: 'BRL', hold: null, price: null, inv: 26500, type: 'fixed_income' },
  { id: 8,  code: 'CDB INTER 110%',     name: 'CDB Inter 110% CDI', cls: 3, value: 25000, orig: 25000, cur: 'BRL', hold: null, price: null, inv: 22000, type: 'fixed_income' },
  { id: 9,  code: 'BTC',     name: 'Bitcoin',                 cls: 4, value: 28400, orig: 28400, cur: 'BRL', hold: 0.042,  price: 676190, inv: 19500 },
  { id: 10, code: 'ETH',     name: 'Ethereum',                cls: 4, value: 5600,  orig: 5600,  cur: 'BRL', hold: 0.31,   price: 18064,  inv: 5100 },
  { id: 11, code: 'IVV',     name: 'iShares Core S&P 500',    cls: 5, value: 18900, orig: 3316,  cur: 'USD', hold: 5.2,    price: 637.69, inv: 15400 },
  { id: 12, code: 'VWCE',    name: 'Vanguard FTSE All-World', cls: 5, value: 3600,  orig: 563,   cur: 'EUR', hold: 4.1,    price: 137.25, inv: 3300 },
]

function portfolioValue() {
  const byClass = CLASSES.map(c => {
    const v = ASSETS.filter(a => a.cls === c.id).reduce((s, a) => s + a.value, 0)
    return { name: c.name, name_key: null, color: c.color, value_brl: v, pct: Math.round(v / 2845) / 100 * 100 }
  })
  return {
    total_brl: 284500, total_usd: 49912, total_eur: 44453,
    by_class: byClass.map(c => ({ ...c, pct: +(c.value_brl / 284500 * 100).toFixed(1) })),
    by_asset: ASSETS.map(a => {
      const c = CLASSES.find(x => x.id === a.cls)!
      return {
        id: a.id, code: a.code, name: a.name, value_brl: a.value, value_orig: a.orig,
        currency: a.cur, class_id: a.cls, class_name: c.name, class_name_key: null,
        class_color: c.color, class_icon: c.icon, holdings: a.hold, price: a.price,
        source: a.type === 'fixed_income' ? 'bcb' : 'brapi', needs_manual: false,
        invested_brl: a.inv, last_manual_date: null,
        fi_type: a.type === 'fixed_income' ? 'cdi' : null, fi_start_date: null, fi_rate: null, fi_spread: null, fi_maturity: null,
        exchange: a.cur === 'USD' ? 'NYSE' : a.cur === 'EUR' ? 'XETRA' : null,
      }
    }),
    generated_at: new Date().toISOString(),
  }
}

function monthlySeries(from: string, to: string) {
  return SERIES.filter(s => s.month >= from && s.month <= to).map((s, i, arr) => ({
    month: s.month,
    total: s.total,
    prev_total: i > 0 ? arr[i - 1].total : (SERIES.find(x => x.month === addM(s.month, -1))?.total ?? s.total - 4500),
    contributions: 3500,
  }))
}

function q(path: string, key: string): string | null {
  const m = path.match(new RegExp(`[?&]${key}=([^&]+)`)); return m ? decodeURIComponent(m[1]) : null
}

const DIV_BY_MONTH = MONTHS.slice(-12).map((month, i) => ({ month, total_brl: 620 + (i * 137) % 480 }))

const ENVELOPES = [
  { id: 1, name: 'Essencial',     name_key: null, type: 'essential',  color: '#1B4FD8', icon: '🏠', pct_target: 50, budget_amount: 2625,
    categories: [
      { id: 11, name: 'Moradia',     name_key: null, icon: '🏠', color: '#1B4FD8', budget_monthly: 1400, envelope_id: 1 },
      { id: 12, name: 'Mercado',     name_key: null, icon: '🛒', color: '#1F8A5B', budget_monthly: 620,  envelope_id: 1 },
      { id: 13, name: 'Transporte',  name_key: null, icon: '🚇', color: '#A36A52', budget_monthly: 180,  envelope_id: 1 },
      { id: 14, name: 'Saúde',       name_key: null, icon: '💊', color: '#D63B2F', budget_monthly: 145,  envelope_id: 1 },
      { id: 15, name: 'Restaurantes',name_key: null, icon: '🍽️', color: '#E8A020', budget_monthly: 280,  envelope_id: 1 },
    ] },
  { id: 2, name: 'Investimentos', name_key: null, type: 'investment', color: '#1F8A5B', icon: '📈', pct_target: 25, budget_amount: 1312,
    categories: [ { id: 21, name: 'Aportes', name_key: null, icon: '📈', color: '#1F8A5B', budget_monthly: 1312, envelope_id: 2 } ] },
  { id: 3, name: 'Reserva',       name_key: null, type: 'savings',    color: '#C8B89A', icon: '🛟', pct_target: 10, budget_amount: 525,
    categories: [ { id: 31, name: 'Emergência', name_key: null, icon: '🛟', color: '#C8B89A', budget_monthly: 525, envelope_id: 3 } ] },
  { id: 4, name: 'Receitas',      name_key: null, type: 'income',     color: '#8C6A28', icon: '💼', pct_target: 0, budget_amount: 5250,
    categories: [ { id: 41, name: 'Salário', name_key: null, icon: '💼', color: '#8C6A28', budget_monthly: null, envelope_id: 4 } ] },
]

function spendingSummary(nMonths: number) {
  const months = MONTHS.slice(-nMonths).map((month, mi) => ({
    month,
    income: 5250,
    expenses: 3580 + (mi * 211) % 540,
    by_envelope: ENVELOPES.map(env => ({
      envelope_id: env.id, name: env.name, name_key: null, type: env.type, color: env.color, icon: env.icon,
      actual: env.type === 'income' ? 5250 : Math.round(env.budget_amount * (0.72 + ((mi * 53 + env.id * 31) % 40) / 100)),
      budget: env.budget_amount,
      categories: env.categories.map(c => ({
        id: c.id, name: c.name, name_key: null, icon: c.icon, color: c.color,
        actual: Math.round((c.budget_monthly ?? 900) * (0.65 + ((mi * 37 + c.id * 17) % 50) / 100)),
        budget: c.budget_monthly ?? 0,
      })),
    })),
  }))
  return {
    months,
    income_config: { monthly_net: 5250, currency: 'EUR' },
    envelopes: ENVELOPES.map(e => ({ id: e.id, name: e.name, name_key: null, type: e.type, color: e.color, icon: e.icon, pct_target: e.pct_target, budget: e.budget_amount })),
  }
}

const TX_DESCRIPTIONS: [string, number, number][] = [
  ['Carrefour Market', -84.3, 12], ['SNCF Connect', -49, 13], ['Loyer Juin', -1400, 11],
  ['Pharmacie Lafayette', -23.9, 14], ['Le Petit Bistro', -56.4, 15], ['Monoprix', -61.2, 12],
  ['Spotify', -10.99, 15], ['Netflix', -13.49, 15], ['Uber', -18.6, 13], ['Boulangerie Maison', -8.4, 12],
  ['Salaire EDF', 5250, 41], ['Picard', -42.7, 12], ['EDF Électricité', -78, 11], ['Decathlon', -94.99, 15],
  ['Amazon.fr', -37.5, 15], ['Aporte B3', -1312, 21], ['Café de Flore', -14.2, 15], ['Navigo', -88.8, 13],
]

function transactions() {
  return TX_DESCRIPTIONS.map(([desc, amount, catId], i) => {
    const cat = ENVELOPES.flatMap(e => e.categories).find(c => c.id === catId) ?? null
    return {
      id: 100 + i, date: `2026-06-${String(2 + (i % 11)).padStart(2, '0')}`, description: desc as string,
      amount, currency: 'EUR', category_id: catId, shared_category_id: null,
      account_id: 1, moment_id: null,
      finance_categories: cat ? { id: cat.id, name: cat.name, name_key: null, icon: cat.icon, color: cat.color, budget_monthly: cat.budget_monthly, envelope_id: cat.envelope_id } : null,
      moments: [], is_internal_transfer: false, linked_transfer_id: null,
      exclude_from_stats: false, reimbursement_group_id: null, source: 'csv', notes: null,
    }
  })
}

const FIXTURES: Array<[RegExp, (path: string) => unknown]> = [
  [/^\/portfolio\/value/, () => portfolioValue()],
  [/^\/portfolio\/share-link/, () => null],
  [/^\/portfolio\/sync-status/, () => ({ total: 12, withHistory: 12, empty: 0, emptyAssets: [] })],
  [/^\/portfolio\/sync-history/, () => ({ synced: 12 })],
  [/^\/portfolio\/sector-data/, () => ({ sectors: { WEGE3: 'Bens Industriais', ITUB4: 'Financeiro', BOVA11: null, KNRI11: 'Imobiliário', HGLG11: 'Imobiliário', MXRF11: 'Imobiliário', BTC: null, ETH: null, IVV: null, VWCE: null, 'TESOURO IPCA+ 2035': null, 'CDB INTER 110%': null } })],
  [/^\/performance\/summary/, p => {
    const from = q(p, 'from') ?? '2026-01', to = q(p, 'to') ?? NOW_YM
    const s = SERIES.find(x => x.month === from)?.total ?? SERIES[0].total
    const e = SERIES.find(x => x.month === to)?.total ?? 284500
    const n = MONTHS.filter(m => m > from && m <= to).length
    const contrib = n * 3500
    return { from, to, value_start: s, value_end: e, contributions: contrib, return_abs: e - s - contrib, return_pct: +(((e - s - contrib) / s) * 100).toFixed(2) }
  }],
  [/^\/performance\/monthly/, p => ({ monthly: monthlySeries(q(p, 'from') ?? '2025-07', q(p, 'to') ?? NOW_YM) })],
  [/^\/performance\/daily/, p => {
    const from = q(p, 'from') ?? '2026-05-12', to = q(p, 'to') ?? '2026-06-12'
    const start = new Date(from), end = new Date(to), out: { date: string; total: number; contributions: number }[] = []
    const days = Math.max(1, Math.round((+end - +start) / 86400000))
    for (let i = 0; i <= days; i++) {
      const d = new Date(+start + i * 86400000)
      out.push({ date: d.toISOString().slice(0, 10), total: Math.round(279000 + i * (5500 / days) + Math.sin(i / 2.6) * 1400), contributions: i === 3 ? 3500 : 0 })
    }
    return { daily: out }
  }],
  [/^\/performance\/benchmarks/, p => {
    const from = q(p, 'from') ?? '2026-01', to = q(p, 'to') ?? NOW_YM
    const ms = MONTHS.filter(m => m >= from && m <= to)
    return {
      cdi_pct: +(ms.length * 0.87).toFixed(2), ibov_pct: +(ms.length * 1.05).toFixed(2), sp500_pct: +(ms.length * 1.21).toFixed(2),
      monthly: ms.map((month, i) => ({ month, cdi_cum: +(0.87 * (i + 1)).toFixed(2), ibov_cum: +((1.05 + Math.sin(i) * 0.9) * (i + 1)).toFixed(2), sp500_cum: +(1.21 * (i + 1) + Math.cos(i) * 0.8).toFixed(2) })),
    }
  }],
  [/^\/performance\/asset-returns/, () => Object.fromEntries(ASSETS.map(a => [a.id, +((a.value - a.inv) / a.inv * 100).toFixed(1)]))],
  [/^\/performance\/inception/, () => ({ inception: INCEPTION })],
  [/^\/assets\/classes/, () => CLASSES.map(c => ({ id: c.id, name: c.name, name_key: null, color: c.color, icon: c.icon }))],
  [/^\/assets\/archived/, () => []],
  [/^\/assets\/\d+\/manual-values/, () => []],
  [/^\/assets\/\d+\/detail/, () => {
    const hist = MONTHS.slice(-30).map((m, i) => ({ date: `${m}-15`, price: +(28 + i * 0.5 + Math.sin(i / 3) * 2.4).toFixed(2), value_brl: Math.round(24000 + i * 520 + Math.sin(i / 3) * 1800), invested_brl: Math.round(20000 + i * 390) }))
    return {
      id: 2, code: 'WEGE3', name: 'WEG S.A.', asset_type: 'ticker', currency: 'BRL', exchange: 'B3',
      sector: 'Bens Industriais', class_id: 1, class_name: 'Ações Brasil', class_color: '#1B4FD8',
      fi_type: null, fi_principal: null, fi_rate: null, fi_spread: null, fi_start_date: null,
      current_value_brl: 38700, current_price: 42.07, price_currency: 'BRL', price_source: 'brapi',
      holdings: 920, avg_cost_brl: 33.91, invested_brl: 31200, gain_loss_brl: 7500, gain_loss_pct: 24.0,
      total_income_brl: 1840, history: hist,
      contributions: [
        { id: 1, date: '2025-11-04', type: 'buy', quantity: 120, price_orig: 38.2, currency: 'BRL', fx_rate_brl: null, value_brl: 4584, description: null, profit_brl: null },
        { id: 2, date: '2025-08-12', type: 'buy', quantity: 200, price_orig: 36.4, currency: 'BRL', fx_rate_brl: null, value_brl: 7280, description: null, profit_brl: null },
        { id: 3, date: '2025-05-06', type: 'buy', quantity: 150, price_orig: 34.1, currency: 'BRL', fx_rate_brl: null, value_brl: 5115, description: null, profit_brl: null },
        { id: 4, date: '2025-02-03', type: 'income', quantity: 0, price_orig: null, currency: 'BRL', fx_rate_brl: null, value_brl: 412, description: 'Dividendos', profit_brl: null },
        { id: 5, date: '2024-11-11', type: 'buy', quantity: 250, price_orig: 31.8, currency: 'BRL', fx_rate_brl: null, value_brl: 7950, description: null, profit_brl: null },
        { id: 6, date: '2024-07-02', type: 'buy', quantity: 200, price_orig: 29.9, currency: 'BRL', fx_rate_brl: null, value_brl: 5980, description: null, profit_brl: null },
      ],
    }
  }],
  [/^\/assets(\?|$)/, () => ASSETS.map(a => ({ id: a.id, code: a.code, name: a.name, asset_type: a.type ?? 'ticker', currency: a.cur, asset_class_id: a.cls, active: true, asset_classes: (() => { const c = CLASSES.find(x => x.id === a.cls)!; return { id: c.id, name: c.name, color: c.color } })() }))],
  [/^\/contributions/, () => ASSETS.slice(0, 9).flatMap((a, i) => {
    const c = CLASSES.find(x => x.id === a.cls)!
    return [{
      id: 200 + i, date: `2026-0${(i % 5) + 1}-1${i % 3}`, type: (i % 4 === 3 ? 'income' : 'buy') as 'buy' | 'income',
      quantity: i % 4 === 3 ? 0 : 10 + i * 7, price_orig: i % 4 === 3 ? null : 30 + i * 4,
      currency: a.cur, fx_rate_brl: a.cur === 'BRL' ? null : a.cur === 'USD' ? 5.7 : 6.4,
      value_brl: i % 4 === 3 ? 380 + i * 60 : (10 + i * 7) * (30 + i * 4), description: i % 4 === 3 ? 'Dividendos' : null,
      assets: { id: a.id, code: a.code, name: a.name, currency: a.cur, asset_classes: { name: c.name, color: c.color } },
    }]
  })],
  [/^\/dividends\/summary/, () => ({
    total_brl: 9840,
    by_asset: [
      { asset_id: 6, code: 'MXRF11', name: 'Maxi Renda', total_brl: 2280, count: 12 },
      { asset_id: 4, code: 'KNRI11', name: 'Kinea Renda Imobiliária', total_brl: 2050, count: 12 },
      { asset_id: 5, code: 'HGLG11', name: 'CSHG Logística', total_brl: 1980, count: 12 },
      { asset_id: 3, code: 'ITUB4', name: 'Itaú Unibanco PN', total_brl: 1690, count: 6 },
      { asset_id: 2, code: 'WEGE3', name: 'WEG S.A.', total_brl: 1040, count: 4 },
      { asset_id: 11, code: 'IVV', name: 'iShares Core S&P 500', total_brl: 800, count: 4 },
    ],
    by_month: DIV_BY_MONTH,
  })],
  [/^\/dividends\/sync/, () => ({ ok: true })],
  [/^\/dividends/, () => DIV_BY_MONTH.slice(-6).flatMap((m, i) => [
    { id: `d${i}a`, asset_id: 6, code: 'MXRF11', name: 'Maxi Renda', ex_date: `${m.month}-05`, pay_date: `${m.month}-15`, amount_per_share: 0.10, amount_total: 183, currency: 'BRL', amount_brl: 183, dividend_type: 'rendimento', source: 'brapi' },
    { id: `d${i}b`, asset_id: 4, code: 'KNRI11', name: 'Kinea Renda Imobiliária', ex_date: `${m.month}-08`, pay_date: `${m.month}-18`, amount_per_share: 1.21, amount_total: 160, currency: 'BRL', amount_brl: 160, dividend_type: 'rendimento', source: 'brapi' },
  ])],
  [/^\/achievements\/check/, () => ({ newly_earned: [] })],
  [/^\/achievements/, () => [
    { achievement_key: 'first_asset', earned_at: '2023-02-11T10:00:00Z' },
    { achievement_key: 'builder', earned_at: '2023-04-02T10:00:00Z' },
    { achievement_key: 'five_digits', earned_at: '2023-07-19T10:00:00Z' },
    { achievement_key: 'six_digits', earned_at: '2024-09-30T10:00:00Z' },
    { achievement_key: 'first_dividend', earned_at: '2023-03-15T10:00:00Z' },
    { achievement_key: 'quarter_million', earned_at: '2026-01-22T10:00:00Z' },
  ]],
  [/^\/notifications\/dismiss/, () => ({ ok: true })],
  [/^\/notifications/, () => ({
    active: [
      { key: 'n1', type: 'achievement', severity: 'success', params: { name: 'Um quarto de milhão' }, occurred_at: '2026-06-10T09:12:00Z', dismissed_at: null, dismissible: true },
      { key: 'n2', type: 'budget_alert', severity: 'warning', params: { category: 'Restaurantes', pct: 92 }, link: '/finances/budget', occurred_at: '2026-06-08T18:40:00Z', dismissed_at: null, dismissible: true },
      { key: 'n3', type: 'subscription_detected', severity: 'info', params: { name: 'Netflix', amount: 13.49, currency: 'EUR' }, link: '/finances/insights', occurred_at: '2026-06-05T07:00:00Z', dismissed_at: null, dismissible: true },
    ],
    history: [
      { key: 'n4', type: 'bank_connected', severity: 'success', params: { bank: 'Boursorama' }, occurred_at: '2026-05-28T11:00:00Z', dismissed_at: '2026-05-29T08:00:00Z', dismissible: true },
    ],
    unread_count: 3,
  })],
  [/^\/fx\/current|^\/current\?pairs/, () => ([{ from: 'USD', rate: 5.7 }, { from: 'EUR', rate: 6.4 }])],
  [/^\/historical|^\/range/, () => ({ points: MONTHS.slice(-12).map((m, i) => ({ date: `${m}-01`, rate: 6.1 + Math.sin(i / 2) * 0.25 })) })],
  [/^\/indices\/[^/]+\/history/, () => ({ code: 'IBOV', points: MONTHS.slice(-60).map((m, i) => ({ date: `${m}-01`, value: 98000 + i * 560 + Math.sin(i / 4) * 4200 })) })],
  [/^\/indices/, () => ([
    { code: 'IBOV', name: 'Ibovespa', category: 'equity', unit: 'pts', description: 'Índice da bolsa brasileira', value: 130450, prev_value: 128900, ytd_pct: 8.4, m12_pct: 14.2, m1_pct: 1.2 },
    { code: 'CDI', name: 'CDI', category: 'rate', unit: '% a.a.', description: 'Taxa interbancária', value: 10.5, prev_value: 10.5, ytd_pct: null, m12_pct: 10.9, m1_pct: 0.83 },
    { code: 'SELIC', name: 'Selic', category: 'rate', unit: '% a.a.', description: 'Taxa básica de juros', value: 10.75, prev_value: 10.75, ytd_pct: null, m12_pct: 11.1, m1_pct: 0.85 },
    { code: 'IPCA', name: 'IPCA', category: 'inflation', unit: '% 12m', description: 'Inflação oficial', value: 4.83, prev_value: 4.91, ytd_pct: 2.3, m12_pct: 4.83, m1_pct: 0.32 },
    { code: 'SP500', name: 'S&P 500', category: 'equity', unit: 'pts', description: 'Índice americano', value: 5210, prev_value: 5067, ytd_pct: 11.8, m12_pct: 22.4, m1_pct: 2.8 },
    { code: 'EURBRL', name: 'EUR/BRL', category: 'fx', unit: 'R$', description: 'Euro em reais', value: 6.4, prev_value: 6.33, ytd_pct: 3.1, m12_pct: 5.9, m1_pct: 1.1 },
  ])],
  [/^\/institutions/, () => []],
  [/^\/banks\/auth/, () => ({ url: '#' })],
  [/^\/finances\/budget/, () => ({ income: { monthly_net: 5250, currency: 'EUR', from_categories: false }, envelopes: ENVELOPES.map(e => ({ id: e.id, name: e.name, name_key: null, icon: e.icon, color: e.color, pct_target: e.pct_target, type: e.type, budget_amount: e.budget_amount, description: null, categories: e.categories })) })],
  [/^\/finances\/spending-summary/, p => spendingSummary(Number(q(p, 'months') ?? 4))],
  [/^\/finances\/categories\/monthly-history/, () => ENVELOPES.flatMap(e => e.categories).slice(0, 6).map(c => ({ id: c.id, name: c.name, name_key: null, icon: c.icon, color: c.color, months: MONTHS.slice(-6).map((month, i) => ({ month, total: Math.round((c.budget_monthly ?? 600) * (0.7 + ((i * 29 + c.id * 13) % 45) / 100)) })) }))],
  [/^\/finances\/categories/, () => ENVELOPES.flatMap(e => e.categories)],
  [/^\/finances\/income/, () => ({ monthly_net: 5250, currency: 'EUR' })],
  [/^\/finances\/accounts\/portfolio-institutions/, () => []],
  [/^\/finances\/accounts\/linked/, () => []],
  [/^\/finances\/accounts/, () => ([
    { id: 1, name: 'Boursorama', currency: 'EUR', institution_name: 'Boursorama', linked_asset_id: null, color: '#1B4FD8', icon: '🏦', balance: 8420, bank_connection: { id: 1, display_name: 'Boursorama', last_synced_at: '2026-06-11T22:10:00Z' } },
    { id: 2, name: 'Nubank', currency: 'BRL', institution_name: 'Nubank', linked_asset_id: null, color: '#A36A52', icon: '💳', balance: 12300, bank_connection: null },
  ])],
  [/^\/finances\/transactions\/months/, () => MONTHS.slice(-14).reverse()],
  [/^\/finances\/transactions\/search/, () => []],
  [/^\/finances\/transactions/, () => transactions()],
  [/^\/finances\/moments-for-picker/, () => ([{ id: 1, name: 'Viagem Japão', icon: '✈️', color: '#2563EB' }, { id: 2, name: 'Casamento', icon: '💒', color: '#DB2777' }])],
  [/^\/finances\/moments\/\d+$/, () => ({
    moment: { id: 1, name: 'Viagem Japão', description: 'Duas semanas em abril de 2027', icon: '✈️', color: '#2563EB', start_date: '2027-04-01', end_date: '2027-04-15', budget: 6000, cover_image_url: null, cover_image_position: null, share_token: null, share_expires_at: null, share_hide_descriptions: false, created_at: '2026-01-05' },
    transactions: transactions().slice(0, 5).map(t => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, currency: t.currency, notes: null, finance_categories: t.finance_categories ? { name: t.finance_categories.name, name_key: null, icon: t.finance_categories.icon, color: t.finance_categories.color } : null })),
    summary: { total: 1240, by_category: [{ name: 'Voos', name_key: null, icon: '✈️', color: '#2563EB', total: 890 }, { name: 'Hospedagem', name_key: null, icon: '🏨', color: '#D97706', total: 350 }] },
  })],
  [/^\/finances\/moments/, () => ([
    { id: 1, name: 'Viagem Japão', description: 'Duas semanas em abril de 2027', icon: '✈️', color: '#2563EB', start_date: '2027-04-01', end_date: '2027-04-15', budget: 6000, cover_image_url: null, cover_image_position: null, share_token: null, share_expires_at: null, share_hide_descriptions: false, created_at: '2026-01-05' },
    { id: 2, name: 'Casamento', description: null, icon: '💒', color: '#DB2777', start_date: '2026-09-12', end_date: '2026-09-12', budget: 15000, cover_image_url: null, cover_image_position: null, share_token: 'abc', share_expires_at: null, share_hide_descriptions: false, created_at: '2025-11-20' },
  ])],
  [/^\/finances\/freedom-plans/, () => ([{ id: 1, name: 'Independência 2041', is_active: true, initial_capital: 284500, monthly_contribution: 3500, monthly_return_rate: 0.8, monthly_income_rate: 0.4, target_amount: 4200000, currency: 'BRL', horizon_years: 15, notes: null, created_at: '2025-01-10', start_date: '2025-01-01' }])],
  [/^\/finances\/subscriptions\/dismissed/, () => ({ dismissed: [] })],
  [/^\/finances\/subscriptions/, () => ({ subscriptions: [
    { key: 's1', name: 'Netflix', frequency: 'monthly', median_amount: 13.49, currency: 'EUR', last_date: '2026-06-03', annual_cost: 161.88, monthly_equivalent: 13.49, occurrences: 9, category: { id: 15, name: 'Restaurantes', icon: '🍽️', color: '#E8A020' } },
    { key: 's2', name: 'Spotify', frequency: 'monthly', median_amount: 10.99, currency: 'EUR', last_date: '2026-06-07', annual_cost: 131.88, monthly_equivalent: 10.99, occurrences: 12, category: null },
    { key: 's3', name: 'iCloud+', frequency: 'monthly', median_amount: 2.99, currency: 'EUR', last_date: '2026-06-01', annual_cost: 35.88, monthly_equivalent: 2.99, occurrences: 12, category: null },
  ] })],
  [/^\/finances\/fee-scan/, () => ({ total: 84.2, by_category: [ { id: 13, name: 'Transporte', icon: '🚇', color: '#A36A52', total: 36.2, count: 4 }, { id: 11, name: 'Moradia', icon: '🏠', color: '#1B4FD8', total: 48.0, count: 2 } ], monthly: ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'].map((month, i) => ({ month, total: 9 + (i * 7) % 11 })) })],
  [/^\/finances\/detect-/, () => ({ linked: 0, created: 0 })],
  [/^\/finances\/reimbursement-groups/, () => []],
  [/^\/shared\/groups/, () => []],
  [/^\/shared\/categories/, () => []],
  [/^\/profile|^\/api\/profile/, () => ({
    email: 'andre@arvo.app', first_name: 'André', last_name: 'Gutto', country: 'França', birthdate: '1993-05-12',
    allocation_targets: { 'Ações Brasil': 35, 'FIIs': 20, 'Renda Fixa': 20, 'Cripto': 10, 'Ações Exterior': 15 },
    avatar_url: '', default_section: 'investments', month_cycle_day: 1, saida_fiscal_brasil: true, tax_country: 'FR',
  })],
  [/^\/reports\/brazil/, () => ({ year: 2025, bens_direitos: [], rendimentos_isentos: [], tributacao_exclusiva: [], ir_retido_total: 0, total_isentos: 0, total_exclusiva: 0, renda_variavel: [], total_ganho_rv: 0, total_perda_rv: 0, total_darf_rv: 0, carryover_final: 0, carne_leao: [], total_carne_leao: 0 })],
  [/^\/reports\/france/, () => ({ year: 2025, events: [], sections_daily: [], sections_year_end: [], totals_daily: {}, totals_year_end: {}, comparison: { daily: { total_eur: 0 }, year_end: { total_eur: 0 }, recommended: 'daily', advantage_eur: 0 }, accounts: [], capital_gains: [], total_gain_eur_daily: 0, total_gain_eur_year_end: 0, fx_rates: { year_end_brl_eur: 0.156, year_end_usd_eur: 0.175 } })],
  [/^\/import\//, () => ({ ok: true })],
]

export async function apiFetch<T>(path: string, _init?: RequestInit): Promise<T> {
  await new Promise(r => setTimeout(r, 120 + Math.random() * 180))
  for (const [re, fn] of FIXTURES) {
    if (re.test(path)) return fn(path) as T
  }
  console.warn('[mock api] sem fixture para', path)
  return [] as unknown as T
}
