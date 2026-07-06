import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import { PageLoader } from '../components/ArvoLoader'
import { useSetupChecklist } from '../components/SetupChecklist'
import { useActiveFriends, type ActiveFriend } from '../hooks/useActiveFriends'
import { PairMomentModal, GroupExpensesModal, type MomentBalance } from './PeoplePage'
import type { ResourceItem } from './ResourcesPage'
import { usePerformanceDaily, usePerformanceBenchmarks } from '../hooks/usePortfolio'
import { projectMonthExpenses, type ProjectionMonth } from '../lib/monthProjection'
import { addMonths, dailyComparisonSeries } from '../lib/performanceComparison'
import Avatar from './voyage/_shared/Avatar'
import CategoryIcon from './community/_shared/CategoryIcon'
import type { PortfolioValue } from '../lib/types'

/* Página "Hoje": abertura do app. O que está vivo agora — patrimônio (obedece
   o olho global), comunidade, viagem, momento, finanças do mês e saldos entre
   amigos. Layout largo como o dashboard, cada card só aparece quando tem algo
   a dizer. Atalhos no fim, só pra destinos que não estão no header. */

interface TodayData {
  first_name: string
  hot_topics: Array<{ id: number; title: string; category_slug: string; category_name: string | null; reply_count: number; last_post_at: string }>
  next_trip: { id: number; title: string; destination: string | null; start_date: string; end_date: string | null; cover_image_url: string | null; ongoing: boolean; past: boolean } | null
  active_moment: { id: number; name: string; icon: string; color: string; start_date: string | null; end_date: string | null; cover_image_url: string | null; ongoing: boolean; past: boolean } | null
  month_summary: { spent: number; budget: number; currency: string; income: number } | null
  community_unseen: number
}

interface ContactBalance { currency: string; amount: number }
interface NamedBalance { name: string; currency: string; amount: number; avatar_url?: string; user_id: string }
interface FreedomPlan { id: number; name: string; is_active: boolean; target_amount: number; currency: string; goal_mode?: 'capital' | 'income'; horizon_years?: number | null; start_date?: string | null }

const GOLD_RGB = '200,184,154'

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

const card: React.CSSProperties = { background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16 }
const cardLabel: React.CSSProperties = { fontFamily: 'var(--arvo-font-body)', fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }
const pillStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '11px 18px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg-muted)', fontFamily: 'var(--arvo-font-body)', fontSize: 13.5 }

// Card com capa (viagem e momento têm o mesmo formato): miniatura à esquerda +
// rótulo/título/data. Um componente só pros dois — sem duplicar.
function CoverCard({ to, coverUrl, accent, icon, label, title, subtitle, fallbackIcon }: {
  to: string
  coverUrl: string | null
  accent: string // "r,g,b" pro gradiente de fallback
  icon?: React.ReactNode // selo colorido ao lado do rótulo — identifica a vertical mesmo quando há capa
  label: string
  title: string
  subtitle?: string
  fallbackIcon: React.ReactNode
}) {
  return (
    <Link to={to} style={{ ...card, overflow: 'hidden', textDecoration: 'none', display: 'flex', alignItems: 'stretch' }}>
      <div style={{
        width: 92, flexShrink: 0,
        background: coverUrl ? `center/cover no-repeat url(${coverUrl})` : `linear-gradient(150deg, rgba(${accent},0.16), var(--arvo-surface-2))`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!coverUrl && fallbackIcon}
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '16px 18px' }}>
        <p style={{ ...cardLabel, display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{label}</p>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 18, color: 'var(--arvo-fg)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
        {subtitle && <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</p>}
      </div>
    </Link>
  )
}

export default function HomePage() {
  const { t, locale } = useI18n()
  const th = (t as any).home ?? {}
  const navigate = useNavigate()
  const { user } = useAuth()
  const { fmt, hideValues, fxRates } = useCurrency()
  const setup = useSetupChecklist(user?.id)

  const [data, setData] = useState<TodayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [wealth, setWealth] = useState<number | null>(null)
  const [hasAssets, setHasAssets] = useState<boolean | null>(null)
  const [balances, setBalances] = useState<{ toReceive: NamedBalance[]; toPay: NamedBalance[] } | null>(null)
  const [balancesByMomentMap, setBalancesByMomentMap] = useState<Record<string, MomentBalance[]>>({})
  const [plan, setPlan] = useState<FreedomPlan | null | undefined>(undefined) // undefined = carregando
  const [spending, setSpending] = useState<{ months: ProjectionMonth[] } | null>(null)
  const [splitPicker, setSplitPicker] = useState(false)
  const [splitFriend, setSplitFriend] = useState<ActiveFriend | null>(null)
  const [splitGroup, setSplitGroup] = useState<{ id: number; name: string } | null>(null)
  const [splitGroups, setSplitGroups] = useState<{ id: number; name: string }[]>([])
  const [resources, setResources] = useState<ResourceItem[]>([])
  const activeFriends = useActiveFriends().filter(f => f.user_id)

  // Comparação Carteira vs CDI/IBOV/S&P500 nos últimos 30 dias — MESMO cálculo do
  // Performance (lib/performanceComparison), só reusado aqui numa linha compacta.
  const _cmpNow = new Date()
  const _cp = (n: number) => String(n).padStart(2, '0')
  const cmpTo = `${_cmpNow.getFullYear()}-${_cp(_cmpNow.getMonth() + 1)}-${_cp(_cmpNow.getDate())}`
  const _cmpFromD = new Date(_cmpNow.getFullYear(), _cmpNow.getMonth(), _cmpNow.getDate() - 29)
  const cmpFrom = `${_cmpFromD.getFullYear()}-${_cp(_cmpFromD.getMonth() + 1)}-${_cp(_cmpFromD.getDate())}`
  const { data: daily30 } = usePerformanceDaily(cmpFrom, cmpTo)
  const { data: bench30 } = usePerformanceBenchmarks(addMonths(cmpFrom.slice(0, 7), -1), cmpTo.slice(0, 7))
  const cmp30series = dailyComparisonSeries(daily30?.daily ?? [], bench30?.monthly ?? [])
  const cmp30 = cmp30series.length ? cmp30series[cmp30series.length - 1] : null

  useEffect(() => {
    apiFetch<TodayData>('/home/today')
      .then(setData)
      .finally(() => setLoading(false))
    apiFetch<PortfolioValue>('/portfolio/value')
      .then(v => { setWealth(v.total_brl); setHasAssets((v.by_asset?.length ?? 0) > 0) })
      .catch(() => setHasAssets(false))
    apiFetch<{ contacts: Array<{ name?: string; email?: string; avatar_url?: string; user_id: string | null; balances?: ContactBalance[]; balancesByMoment?: MomentBalance[] }> }>('/people')
      .then(({ contacts }) => {
        const toReceive: NamedBalance[] = []
        const toPay: NamedBalance[] = []
        const bbmMap: Record<string, MomentBalance[]> = {}
        for (const c of contacts ?? []) {
          if (!c.user_id) continue
          if (c.balancesByMoment) bbmMap[c.user_id] = c.balancesByMoment
          const who = (c.name ?? c.email ?? '').split(' ')[0] || '?'
          for (const b of c.balances ?? []) {
            if (b.amount >= 0.01) toReceive.push({ name: who, currency: b.currency, amount: b.amount, avatar_url: c.avatar_url, user_id: c.user_id })
            else if (b.amount <= -0.01) toPay.push({ name: who, currency: b.currency, amount: Math.abs(b.amount), avatar_url: c.avatar_url, user_id: c.user_id })
          }
        }
        toReceive.sort((a, b) => b.amount - a.amount)
        toPay.sort((a, b) => b.amount - a.amount)
        setBalances(toReceive.length || toPay.length ? { toReceive, toPay } : null)
        setBalancesByMomentMap(bbmMap)
      })
      .catch(() => {})
    apiFetch<FreedomPlan[]>('/finances/freedom-plans')
      .then(plans => setPlan((plans ?? []).find(p => p.is_active) ?? null))
      .catch(() => setPlan(null))
    apiFetch<{ months: ProjectionMonth[] }>('/finances/spending-summary?months=60')
      .then(setSpending)
      .catch(() => {})
    apiFetch<{ id: number; name: string }[]>('/shared/groups')
      .then(setSplitGroups)
      .catch(() => {})
    apiFetch<{ resources: ResourceItem[] }>('/resources')
      .then(({ resources }) => setResources(resources.filter(r => !r.unlocked).concat(resources.filter(r => r.unlocked)).slice(0, 1)))
      .catch(() => {})
  }, [])

  // Previsão do mês pela MESMA função da Visão Geral (lib/monthProjection), sem duplicar
  const forecast = (() => {
    if (!spending || !data?.month_summary) return null
    const cycleDay = (user?.user_metadata?.month_cycle_day as number) || 1
    const now = new Date()
    const anchor = cycleDay > 1 && now.getDate() >= cycleDay ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : now
    const monthKey = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`
    return projectMonthExpenses({ months: spending.months, month: monthKey, cycleDay, today: now, totalBudgeted: data.month_summary.budget, isCurrentMonth: true }).projected
  })()

  function fmtCur(amount: number, cur: string) {
    if (hideValues) return '•••'
    return new Intl.NumberFormat(locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(amount)
  }

  const intlLocale = locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? (th.morning ?? 'Bom dia') : hour < 19 ? (th.afternoon ?? 'Boa tarde') : (th.evening ?? 'Boa noite')
  const dateLine = new Intl.DateTimeFormat(intlLocale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' })

  const shortcuts: { to: string; label: string; icon: React.ReactNode }[] = [
    { to: '/people', label: t.nav.people, icon: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19.5v-1a5.5 5.5 0 0 1 11 0v1M15.5 13.2a4.3 4.3 0 0 1 5 4.2v1.1" /></> },
    { to: '/finances/moments', label: th.quickMoments ?? 'Momentos', icon: <><circle cx="12" cy="12" r="8.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5v4.7l3 1.8" /></> },
    { to: '/dividends', label: (t as any).nav?.dividends ?? 'Renda passiva', icon: <><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" /></> },
  ]

  if (loading) return <PageLoader />

  const showWealth = hasAssets !== false

  return (
    <div className="space-y-5">
      {/* Saudação */}
      <div>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>{dateLine}</p>
        <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 30, color: 'var(--arvo-fg)', marginTop: 4 }}>
          {greeting}{data?.first_name ? `, ${data.first_name}` : ''}
        </h1>
      </div>

      {/* Bento: coluna principal larga + coluna lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-5">
          {/* Patrimônio — hero com brilho dourado, valor obedece o olho global */}
          {showWealth && (
            <Link to="/dashboard" className="p-6 sm:p-8" style={{
              ...card,
              position: 'relative', overflow: 'hidden', display: 'block', textDecoration: 'none',
              border: `1px solid rgba(${GOLD_RGB},0.55)`,
              background: `linear-gradient(150deg, rgba(${GOLD_RGB},0.16), var(--arvo-surface) 62%)`,
              boxShadow: `0 12px 40px -16px rgba(${GOLD_RGB},0.7)`,
            }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, rowGap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ ...cardLabel, color: '#8C6A28' }}>{th.wealthLabel ?? 'Patrimônio'}</p>
                  <p className="arvo-num text-[34px] sm:text-[46px]" style={{ fontFamily: 'var(--arvo-font-display)', lineHeight: 1.05, color: 'var(--arvo-fg)', marginTop: 10 }}>
                    {wealth != null ? fmt(wealth, 0) : '…'}
                  </p>
                </div>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '9px 16px', borderRadius: 999, background: 'var(--arvo-pill-active-bg)', color: 'var(--arvo-pill-active-fg)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {th.openDashboard ?? 'Ver dashboard'}
                </span>
              </div>
              {/* Rentabilidade nos últimos 30d, e quanto ficou acima/abaixo de cada benchmark
                  (um número por índice, não o valor absoluto dele) — o absoluto de cada índice
                  já aparece com outro significado/período no card de Índices do Dashboard;
                  repetir aqui como número solto gerava a impressão de números "diferentes"
                  pro mesmo índice. Aqui é sempre "quanto eu bati esse índice", sem ambiguidade. */}
              {!hideValues && cmp30 && (
                <div style={{ position: 'relative', marginTop: 18, paddingTop: 14, borderTop: `1px solid rgba(${GOLD_RGB},0.35)`, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 20px' }}>
                  <span style={{ ...cardLabel, fontSize: 9.5, color: '#8C6A28' }}>{th.last30d ?? 'Últimos 30 dias'}</span>
                  <span style={{ fontFamily: 'var(--arvo-font-body)' }}>
                    <span style={{ color: 'var(--arvo-fg-soft)', fontSize: 11 }}>{th.walletShort ?? 'Carteira'} </span>
                    <span className={cmp30.portfolio >= 0 ? 'arvo-delta-pos' : 'arvo-delta-neg'} style={{ fontSize: 14, fontWeight: 700 }}>{cmp30.portfolio >= 0 ? '+' : ''}{cmp30.portfolio.toFixed(1)}%</span>
                  </span>
                  {[
                    { label: 'CDI', v: cmp30.cdi },
                    { label: 'IBOV', v: cmp30.ibov },
                    { label: 'S&P 500', v: cmp30.sp500 },
                  ].map((it, i) => {
                    const delta = it.v == null ? null : Math.round((cmp30.portfolio - it.v) * 10) / 10
                    return (
                      <span key={i} style={{ fontFamily: 'var(--arvo-font-body)' }}>
                        <span style={{ color: 'var(--arvo-fg-soft)', fontSize: 11 }}>vs {it.label} </span>
                        {delta == null
                          ? <span style={{ color: 'var(--arvo-fg-faint)', fontSize: 13 }}>–</span>
                          : <span className={delta >= 0 ? 'arvo-delta-pos' : 'arvo-delta-neg'} style={{ fontSize: 13, fontWeight: 600 }}>{delta >= 0 ? '+' : ''}{delta}%</span>}
                      </span>
                    )
                  })}
                </div>
              )}
            </Link>
          )}

          {/* Finanças do mês — gasto x orçado, renda e saldo (tudo de transações reais) */}
          {data?.month_summary && (
            <Link to="/finances" style={{ ...card, padding: '18px 20px', textDecoration: 'none', display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <p style={cardLabel}>{th.financesLabel ?? 'Finanças do mês'}</p>
                {data.month_summary.budget > 0 && !hideValues && (
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, fontWeight: 600, color: data.month_summary.spent > data.month_summary.budget ? 'var(--arvo-red)' : 'var(--arvo-fg-soft)' }}>
                    {Math.round((data.month_summary.spent / data.month_summary.budget) * 100)}%
                  </span>
                )}
              </div>
              <p className="arvo-num" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 23, color: 'var(--arvo-fg)', marginTop: 7 }}>
                {fmtCur(data.month_summary.spent, data.month_summary.currency)}
                {data.month_summary.budget > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--arvo-fg-soft)' }}> {th.ofBudget ?? 'de'} {fmtCur(data.month_summary.budget, data.month_summary.currency)}</span>
                )}
              </p>
              {data.month_summary.budget > 0 && (
                <div style={{ height: 6, borderRadius: 99, background: 'var(--arvo-hover-bg)', overflow: 'hidden', marginTop: 10 }}>
                  <div style={{ width: `${Math.min(100, (data.month_summary.spent / data.month_summary.budget) * 100)}%`, height: '100%', borderRadius: 99, background: data.month_summary.spent > data.month_summary.budget ? 'var(--arvo-red)' : 'var(--arvo-gold)' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 32, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--arvo-border-soft)' }}>
                {forecast != null && (
                  <div>
                    <p style={{ ...cardLabel, fontSize: 9.5 }}>{th.forecastLabel ?? 'Previsão'}</p>
                    <p className="arvo-num" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 15, color: data.month_summary.budget > 0 && forecast > data.month_summary.budget ? 'var(--arvo-red)' : 'var(--arvo-fg)', marginTop: 3 }}>
                      {fmtCur(forecast, data.month_summary.currency)}
                    </p>
                  </div>
                )}
                <div>
                  <p style={{ ...cardLabel, fontSize: 9.5 }}>{th.incomeLabel ?? 'Renda'}</p>
                  <p className="arvo-num" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 15, color: 'var(--arvo-fg)', marginTop: 3 }}>
                    {fmtCur(data.month_summary.income, data.month_summary.currency)}
                  </p>
                </div>
                {(() => { const saldo = data.month_summary.income - data.month_summary.spent; return (
                  <div>
                    <p style={{ ...cardLabel, fontSize: 9.5 }}>{th.balanceLabel ?? 'Saldo do mês'}</p>
                    <p className="arvo-num" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 15, marginTop: 3 }}>
                      <span className={hideValues ? undefined : saldo >= 0 ? 'arvo-delta-pos' : 'arvo-delta-neg'}>{saldo < 0 ? '−' : ''}{fmtCur(Math.abs(saldo), data.month_summary.currency)}</span>
                    </p>
                  </div>
                )})()}
              </div>
            </Link>
          )}

          {/* Comunidade — cabeçalho com cor + ponto vermelho de respostas novas */}
          {data && data.hot_topics.length > 0 && (
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(90deg, rgba(232,160,32,0.12), transparent 70%)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#E8A020', display: 'inline-flex' }}>
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19.5v-1a5.5 5.5 0 0 1 11 0v1M15.5 13.2a4.3 4.3 0 0 1 5 4.2v1.1" /></svg>
                  </span>
                  <p style={{ ...cardLabel, color: 'var(--arvo-fg-muted)' }}>{th.communityLabel ?? 'Na comunidade'}</p>
                  {data.community_unseen > 0 && (
                    <span title={th.newReplies ?? 'respostas novas'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 17, height: 17, padding: '0 5px', borderRadius: 999, background: 'var(--arvo-red)', color: '#fff', fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, fontWeight: 700, lineHeight: 1 }}>
                      {data.community_unseen}
                    </span>
                  )}
                </div>
                <Link to="/community" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: '#E8A020', textDecoration: 'none' }}>{th.seeAll ?? 'Ver tudo'} →</Link>
              </div>
              {data.hot_topics.map(topic => (
                <button
                  key={topic.id}
                  onClick={() => navigate(`/community/${topic.category_slug}/${topic.id}`)}
                  className="w-full text-left flex items-center gap-3"
                  style={{ padding: '14px 20px', background: 'none', border: 'none', borderTop: '1px solid var(--arvo-border-soft)', cursor: 'pointer' }}
                >
                  <span style={{ color: '#E8A020', display: 'inline-flex', flexShrink: 0 }}><CategoryIcon slug={topic.category_slug} size={15} /></span>
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.title}</span>
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', flexShrink: 0 }}>{timeAgo(topic.last_post_at)}</span>
                </button>
              ))}
            </div>
          )}

        </div>

        {/* Coluna lateral */}
        <div className="space-y-5">
          {/* Metas — progresso rumo à liberdade financeira. Só no desktop: era pra preencher
              o espaço largo; no mobile some pra não empurrar Viagem/Comunidade pra baixo. */}
          {plan === null && (
            <Link to="/finances/freedom" className="hidden lg:block" style={{ ...card, padding: '16px 18px', textDecoration: 'none' }}>
              <p style={cardLabel}>{th.goalsLabel ?? 'Liberdade financeira'}</p>
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', marginTop: 8, lineHeight: 1.4 }}>{th.goalEmpty ?? 'Defina sua meta e acompanhe o progresso.'}</p>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '8px 15px', borderRadius: 999, background: 'var(--arvo-pill-active-bg)', color: 'var(--arvo-pill-active-fg)' }}>
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
                {th.goalCreate ?? 'Criar plano'}
              </span>
            </Link>
          )}
          {plan && (() => {
            const cur = plan.currency as 'USD' | 'EUR'
            const targetBrl = plan.currency === 'BRL' ? plan.target_amount : plan.target_amount * (fxRates[cur] ?? 1)
            const pct = wealth != null && targetBrl > 0 ? Math.min(100, (wealth / targetBrl) * 100) : 0
            const baseYear = plan.start_date ? new Date(plan.start_date).getFullYear() : new Date().getFullYear()
            const goalYear = plan.horizon_years ? baseYear + Math.round(plan.horizon_years) : null
            return (
              <Link to="/finances/freedom" className="hidden lg:block" style={{ ...card, padding: '18px 20px', textDecoration: 'none' }}>
                <p style={cardLabel}>{th.goalsLabel ?? 'Liberdade financeira'}</p>
                <p className="arvo-num" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 23, color: 'var(--arvo-fg)', marginTop: 7 }}>
                  {hideValues ? '•••' : `${Math.round(pct)}%`}
                  <span style={{ fontSize: 12.5, color: 'var(--arvo-fg-soft)' }}> {th.goalAchieved ?? 'conquistado'}</span>
                </p>
                <div style={{ height: 6, borderRadius: 99, background: 'var(--arvo-hover-bg)', overflow: 'hidden', marginTop: 12 }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: 'var(--arvo-gold)' }} />
                </div>
                {goalYear && (
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)', marginTop: 9 }}>
                    {th.goalForYear ?? 'meta para'} {goalYear}
                  </p>
                )}
              </Link>
            )
          })()}

          {/* Entre amigos — quem e quanto, com botão de dividir por amigo + dividir despesa.
              Fica logo após Metas (as duas são cards "financeiros") pra deixar Viagem,
              Momento e Recursos juntos como bloco de conteúdo, sem intercalar. */}
          {(balances || activeFriends.length > 0) && (
            <div style={{ ...card, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={cardLabel}>{th.balancesLabel ?? 'Entre amigos'}</p>
                <Link to="/people" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: '#8C6A28', textDecoration: 'none' }}>{th.seeAll ?? 'Ver tudo'} →</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 11 }}>
                {(balances
                  ? [...balances.toReceive.map(b => ({ ...b, receive: true })), ...balances.toPay.map(b => ({ ...b, receive: false }))].sort((a, b) => b.amount - a.amount)
                  : activeFriends.map(f => ({ name: f.name ?? f.email ?? '?', avatar_url: f.avatar_url, user_id: f.user_id as string, amount: null as number | null, currency: '', receive: true }))
                ).slice(0, 4).map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Avatar name={b.name} avatarUrl={b.avatar_url} size={26} />
                    <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                    {b.amount != null && (
                      <span className={hideValues ? undefined : b.receive ? 'arvo-delta-pos' : 'arvo-delta-neg'} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, fontWeight: 600, flexShrink: 0 }}>
                        {b.receive ? '' : '−'}{fmtCur(b.amount, b.currency)}
                      </span>
                    )}
                    <button type="button" onClick={() => setSplitFriend({ email: '', name: b.name, user_id: b.user_id } as ActiveFriend)} title={th.splitExpense ?? 'Dividir despesa'} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', padding: 3, display: 'inline-flex' }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2 4.5h6M2 4.5l2.2-2.2M2 4.5l2.2 2.2M14 11.5H6M14 11.5l-2.2-2.2M14 11.5l-2.2 2.2" /></svg>
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setSplitPicker(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 12, padding: '8px 14px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg-muted)', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, cursor: 'pointer' }}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2 4.5h6M2 4.5l2.2-2.2M2 4.5l2.2 2.2M14 11.5H6M14 11.5l-2.2-2.2M14 11.5l-2.2 2.2" /></svg>
                {th.splitExpense ?? 'Dividir despesa'}
              </button>
            </div>
          )}

          {/* Viagem — capa + linka pro detalhe (onde ficam as despesas) */}
          {data?.next_trip && (
            <CoverCard
              to={`/voyage/${data.next_trip.id}`}
              coverUrl={data.next_trip.cover_image_url}
              accent="214,59,47"
              icon={<svg width="13" height="13" fill="var(--arvo-red)" viewBox="0 0 24 24"><path d="M12 2c-3.9 0-7 3.1-7 7 0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" /></svg>}
              label={data.next_trip.ongoing ? (th.tripNow ?? 'Viagem em andamento') : data.next_trip.past ? (th.tripLast ?? 'Última viagem') : (th.tripNext ?? 'Próxima viagem')}
              title={data.next_trip.title}
              subtitle={`${data.next_trip.destination ? data.next_trip.destination + ' · ' : ''}${fmtDay(data.next_trip.start_date)}${data.next_trip.end_date ? ' – ' + fmtDay(data.next_trip.end_date) : ''}`}
              fallbackIcon={<svg width="24" height="24" fill="var(--arvo-red)" viewBox="0 0 24 24"><path d="M12 2c-3.9 0-7 3.1-7 7 0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" /></svg>}
            />
          )}

          {/* Momento avulso (sem viagem associada — essa fica oculta) */}
          {data?.active_moment && (
            <CoverCard
              to="/finances/moments"
              coverUrl={data.active_moment.cover_image_url}
              accent="200,184,154"
              label={data.active_moment.ongoing ? (th.momentLabel ?? 'Momento em andamento') : data.active_moment.past ? (th.momentLast ?? 'Último momento') : (th.momentNext ?? 'Próximo momento')}
              title={data.active_moment.name}
              subtitle={data.active_moment.start_date
                ? (data.active_moment.ongoing && data.active_moment.end_date
                    ? `${th.until ?? 'até'} ${fmtDay(data.active_moment.end_date)}`
                    : `${fmtDay(data.active_moment.start_date)}${data.active_moment.end_date ? ' – ' + fmtDay(data.active_moment.end_date) : ''}`)
                : undefined}
              fallbackIcon={<span style={{ width: 16, height: 16, borderRadius: '50%', background: data.active_moment.color || 'var(--arvo-gold)' }} />}
            />
          )}

          {/* Recursos — o mais recente (ou o próximo ainda não liberado) do canal, mesmo
              endpoint/tipo da página /resources. Mesmo formato de capa da Viagem/Momento,
              pra ficar no mesmo idioma visual da coluna em vez de uma lista de texto solta. */}
          {resources[0] && (() => {
            const res = resources[0]
            const tierLabel = res.visibility === 'free' ? t.resources.free : res.visibility === 'plus' ? t.resources.plus : t.resources.beta
            return (
              <CoverCard
                to={`/resources/${res.slug}`}
                coverUrl={res.preview_image_url}
                accent="163,106,82"
                icon={<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--arvo-terracotta)" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M6.5 9.5l3-3M7.5 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M8.5 11.5l-1 1a2.5 2.5 0 01-3.5-3.5l1-1" /></svg>}
                label={t.resources.title}
                title={res.title}
                subtitle={res.unlocked ? t.resources.unlocked : tierLabel}
                fallbackIcon={<img src="/brand/logo/arvo-symbol-gold.svg" width="22" height="24" alt="" />}
              />
            )
          })()}
        </div>
      </div>

      {/* Configuração da conta — pequeno, no fim da página, colapsado por padrão */}
      {setup.visible && <SetupCard setup={setup} onNavigate={navigate} />}

      {/* Atalhos — pills pra ações e destinos que não estão no header */}
      <div>
        <p style={{ ...cardLabel, marginBottom: 11 }}>{th.shortcuts ?? 'Atalhos'}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {shortcuts.map(s => (
            <Link key={s.to} to={s.to} style={{ ...pillStyle, textDecoration: 'none' }}>
              <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-soft)" strokeWidth={1.7}>{s.icon}</svg>
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Seletor de amigo OU grupo pra dividir despesa */}
      {splitPicker && !splitFriend && !splitGroup && (
        <div onClick={() => setSplitPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.45)' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, maxHeight: '80vh', overflowY: 'auto', background: 'var(--arvo-surface)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-lg)', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <p style={{ flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>{th.splitWithWho ?? 'Dividir com quem?'}</p>
              <button type="button" onClick={() => setSplitPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" d="M1.5 1.5l11 11M12.5 1.5l-11 11" /></svg>
              </button>
            </div>
            {activeFriends.length === 0 && splitGroups.length === 0 ? (
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', lineHeight: 1.5 }}>
                {th.splitNoFriends ?? 'Você ainda não tem amigos conectados para dividir.'}{' '}
                <Link to="/people" style={{ color: '#8C6A28' }}>{t.nav.people} →</Link>
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {activeFriends.map(f => (
                  <button key={`f-${f.user_id}`} type="button" onClick={() => setSplitFriend(f)} className="w-full text-left flex items-center gap-3"
                    style={{ padding: '9px 10px', borderRadius: 10, background: 'none', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'var(--arvo-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--arvo-font-body)', fontSize: 12, fontWeight: 600, color: 'var(--arvo-fg-muted)', overflow: 'hidden' }}>
                      {f.avatar_url ? <img src={f.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (f.name ?? f.email).slice(0, 1).toUpperCase()}
                    </span>
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)' }}>{f.name ?? f.email}</span>
                  </button>
                ))}
                {splitGroups.length > 0 && (
                  <div style={{ marginTop: activeFriends.length > 0 ? 6 : 0, paddingTop: activeFriends.length > 0 ? 10 : 0, borderTop: activeFriends.length > 0 ? '1px solid var(--arvo-border-soft)' : 'none' }}>
                    {splitGroups.map(g => (
                      <button key={`g-${g.id}`} type="button" onClick={() => setSplitGroup(g)} className="w-full text-left flex items-center gap-3"
                        style={{ padding: '9px 10px', borderRadius: 10, background: 'none', border: 'none', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'var(--arvo-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-muted)" strokeWidth={1.7}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19.5v-1a5.5 5.5 0 0 1 11 0v1M15.5 13.2a4.3 4.3 0 0 1 5 4.2v1.1" /></svg>
                        </span>
                        <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)' }}>{g.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {splitGroup && (
        <GroupExpensesModal
          groupId={splitGroup.id}
          groupName={splitGroup.name}
          initialMomentId={null}
          onClose={() => { setSplitGroup(null); setSplitPicker(false) }}
        />
      )}
      {splitFriend?.user_id && (
        <PairMomentModal
          friendUserId={splitFriend.user_id}
          friendName={splitFriend.name ?? splitFriend.email}
          initialMomentId={null}
          balancesByMoment={balancesByMomentMap[splitFriend.user_id]}
          onClose={() => { setSplitFriend(null); setSplitPicker(false) }}
        />
      )}
    </div>
  )
}

/* Card de configuração colapsável na Hoje. Reusa o hook do checklist do header
   (mesma flag de dispensa e mesmo progresso) — só muda a apresentação. */
function SetupCard({ setup, onNavigate }: {
  setup: ReturnType<typeof useSetupChecklist>
  onNavigate: (to: string) => void
}) {
  const { t } = useI18n()
  const s = (t as unknown as Record<string, Record<string, string>>).setup
  const [collapsed, setCollapsed] = useState(true) // colapsado por padrão
  const pct = setup.doneCount / setup.total
  const SIZE = 30, R = 11, C = 2 * Math.PI * R

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)' }}>
      {/* Cabeçalho compacto: anel de progresso (o mesmo do header) + título + chevron */}
      <button onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'expandir' : 'recolher'} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ flexShrink: 0 }}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#1B4FD8" strokeWidth={2.5} strokeOpacity={0.15} />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#1B4FD8" strokeWidth={2.5} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset .4s ease' }} />
          <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, fontWeight: 700, fill: '#1B4FD8' }}>{setup.doneCount}</text>
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, fontWeight: 600, color: 'var(--arvo-fg)' }}>{s.title}</p>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)', marginTop: 1 }}>{setup.doneCount}/{setup.total}</p>
        </div>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-soft)" strokeWidth={2} style={{ flexShrink: 0, transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }}><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
      </button>

      {!collapsed && (
        <div style={{ padding: '2px 8px 8px' }}>
          {setup.steps.map(step => (
            <button
              key={step.key}
              onClick={() => { if (!step.done) onNavigate(step.to) }}
              className="w-full text-left flex items-center gap-3"
              style={{ padding: '9px 10px', borderRadius: 10, background: 'none', border: 'none', cursor: step.done ? 'default' : 'pointer' }}
            >
              <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, border: `2px solid ${step.done ? '#22c55e' : '#1B4FD8'}`, background: step.done ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {step.done && <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </span>
              <span style={{ flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: step.done ? 'var(--arvo-fg-soft)' : 'var(--arvo-fg)', textDecoration: step.done ? 'line-through' : 'none' }}>{step.label}</span>
              {!step.done && <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="rgba(27,79,216,0.5)" strokeWidth={2.2} style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>}
            </button>
          ))}
          <div style={{ padding: '4px 10px 6px' }}>
            <button onClick={setup.hide} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{s.dismiss}</button>
          </div>
        </div>
      )}
    </div>
  )
}
