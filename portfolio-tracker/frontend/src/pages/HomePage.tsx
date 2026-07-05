import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import { PageLoader } from '../components/ArvoLoader'
import { useSetupChecklist } from '../components/SetupChecklist'
import { useActiveFriends, type ActiveFriend } from '../hooks/useActiveFriends'
import { PairMomentModal } from './PeoplePage'
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
  active_moment: { id: number; name: string; icon: string; color: string; start_date: string | null; end_date: string | null; ongoing: boolean } | null
  month_summary: { spent: number; budget: number; currency: string } | null
  community_unseen: number
}

interface ContactBalance { currency: string; amount: number }
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
  const [balances, setBalances] = useState<{ toReceive: ContactBalance[]; toPay: ContactBalance[] } | null>(null)
  const [plan, setPlan] = useState<FreedomPlan | null | undefined>(undefined) // undefined = carregando
  const [splitPicker, setSplitPicker] = useState(false)
  const [splitFriend, setSplitFriend] = useState<ActiveFriend | null>(null)
  const activeFriends = useActiveFriends().filter(f => f.user_id)

  useEffect(() => {
    apiFetch<TodayData>('/home/today')
      .then(setData)
      .finally(() => setLoading(false))
    apiFetch<PortfolioValue>('/portfolio/value')
      .then(v => { setWealth(v.total_brl); setHasAssets((v.by_asset?.length ?? 0) > 0) })
      .catch(() => setHasAssets(false))
    apiFetch<{ contacts: Array<{ balances?: ContactBalance[] }> }>('/people')
      .then(({ contacts }) => {
        const byCur: Record<string, number> = {}
        for (const c of contacts ?? []) for (const b of c.balances ?? []) {
          byCur[b.currency] = (byCur[b.currency] ?? 0) + b.amount
        }
        const toReceive = Object.entries(byCur).filter(([, v]) => v >= 0.01).map(([currency, amount]) => ({ currency, amount }))
        const toPay = Object.entries(byCur).filter(([, v]) => v <= -0.01).map(([currency, amount]) => ({ currency, amount: Math.abs(amount) }))
        setBalances(toReceive.length || toPay.length ? { toReceive, toPay } : null)
      })
      .catch(() => {})
    apiFetch<FreedomPlan[]>('/finances/freedom-plans')
      .then(plans => setPlan((plans ?? []).find(p => p.is_active) ?? null))
      .catch(() => setPlan(null))
  }, [])

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

      {/* Card de configuração (só quando a conta está incompleta e não foi dispensado) */}
      {setup.visible && <SetupCard setup={setup} firstName={data?.first_name} onNavigate={navigate} />}

      {/* Bento: coluna principal larga + coluna lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-5">
          {/* Patrimônio — hero com brilho dourado, valor obedece o olho global */}
          {showWealth && (
            <Link to="/dashboard" style={{
              ...card,
              position: 'relative', overflow: 'hidden', display: 'block', textDecoration: 'none',
              padding: '32px 34px',
              border: `1px solid rgba(${GOLD_RGB},0.55)`,
              background: `linear-gradient(150deg, rgba(${GOLD_RGB},0.16), var(--arvo-surface) 62%)`,
              boxShadow: `0 12px 40px -16px rgba(${GOLD_RGB},0.7)`,
            }}>
              <img src="/brand/logo/arvo-symbol-gold.svg" alt="" aria-hidden style={{ position: 'absolute', right: -20, bottom: -26, width: 185, opacity: 0.07, pointerEvents: 'none' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p style={{ ...cardLabel, color: '#8C6A28' }}>{th.wealthLabel ?? 'Patrimônio'}</p>
                  <p className="arvo-num" style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 46, lineHeight: 1.05, color: 'var(--arvo-fg)', marginTop: 10 }}>
                    {wealth != null ? fmt(wealth, 0) : '…'}
                  </p>
                </div>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '9px 16px', borderRadius: 999, background: 'var(--arvo-pill-active-bg)', color: 'var(--arvo-pill-active-fg)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {th.openDashboard ?? 'Ver dashboard'}
                </span>
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
                  style={{ padding: '14px 20px', borderTop: '1px solid var(--arvo-border-soft)', background: 'none', border: 'none', borderTopStyle: 'solid', cursor: 'pointer' }}
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
          {/* Finanças do mês */}
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
            </Link>
          )}

          {/* Metas — progresso rumo à liberdade financeira, ou convite pra criar o plano */}
          {plan === null && (
            <Link to="/finances/freedom" style={{ ...card, padding: '16px 18px', textDecoration: 'none', display: 'block' }}>
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
              <Link to="/finances/freedom" style={{ ...card, padding: '18px 20px', textDecoration: 'none', display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <p style={cardLabel}>{th.goalsLabel ?? 'Liberdade financeira'}{goalYear ? ` · ${goalYear}` : ''}</p>
                  {!hideValues && <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, fontWeight: 600, color: 'var(--arvo-gold-text, #8C6A28)' }}>{Math.round(pct)}%</span>}
                </div>
                <p className="arvo-num" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 23, color: 'var(--arvo-fg)', marginTop: 7 }}>
                  {wealth != null ? fmt(wealth, 0) : '…'}
                  <span style={{ fontSize: 12.5, color: 'var(--arvo-fg-soft)' }}> {th.ofBudget ?? 'de'} {fmt(targetBrl, 0)}</span>
                </p>
                <div style={{ height: 6, borderRadius: 99, background: 'var(--arvo-hover-bg)', overflow: 'hidden', marginTop: 12 }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: 'var(--arvo-gold)' }} />
                </div>
              </Link>
            )
          })()}

          {/* Viagem — com miniatura da capa, linka pro detalhe (onde ficam as despesas) */}
          {data?.next_trip && (
            <Link to={`/voyage/${data.next_trip.id}`} style={{ ...card, overflow: 'hidden', textDecoration: 'none', display: 'flex', alignItems: 'stretch' }}>
              <div style={{
                width: 78, flexShrink: 0, position: 'relative',
                background: data.next_trip.cover_image_url
                  ? `center/cover no-repeat url(${data.next_trip.cover_image_url})`
                  : 'linear-gradient(150deg, rgba(214,59,47,0.16), var(--arvo-surface-2))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {!data.next_trip.cover_image_url && (
                  <svg width="22" height="22" fill="var(--arvo-red)" viewBox="0 0 24 24"><path d="M12 2c-3.9 0-7 3.1-7 7 0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" /></svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: '14px 16px' }}>
                <p style={cardLabel}>{data.next_trip.ongoing ? (th.tripNow ?? 'Viagem em andamento') : data.next_trip.past ? (th.tripLast ?? 'Última viagem') : (th.tripNext ?? 'Próxima viagem')}</p>
                <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.next_trip.title}</p>
                <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {data.next_trip.destination ? `${data.next_trip.destination} · ` : ''}
                  {fmtDay(data.next_trip.start_date)}{data.next_trip.end_date ? ` – ${fmtDay(data.next_trip.end_date)}` : ''}
                </p>
              </div>
            </Link>
          )}

          {/* Momento (só com data: em andamento ou próximo de verdade) */}
          {data?.active_moment && (
            <Link to="/finances/moments" style={{ ...card, padding: '16px 18px', textDecoration: 'none', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: data.active_moment.color || 'var(--arvo-gold)', flexShrink: 0 }} />
                <p style={cardLabel}>{data.active_moment.ongoing ? (th.momentLabel ?? 'Momento em andamento') : (th.momentNext ?? 'Próximo momento')}</p>
              </div>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 18, color: 'var(--arvo-fg)', marginTop: 7 }}>{data.active_moment.name}</p>
              {data.active_moment.start_date && (
                <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', marginTop: 3 }}>
                  {data.active_moment.ongoing && data.active_moment.end_date
                    ? `${th.until ?? 'até'} ${fmtDay(data.active_moment.end_date)}`
                    : `${fmtDay(data.active_moment.start_date)}${data.active_moment.end_date ? ` – ${fmtDay(data.active_moment.end_date)}` : ''}`}
                </p>
              )}
            </Link>
          )}

          {/* Saldos entre amigos */}
          {balances && (
            <Link to="/people" style={{ ...card, padding: '16px 18px', textDecoration: 'none', display: 'block' }}>
              <p style={cardLabel}>{th.balancesLabel ?? 'Entre amigos'}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {balances.toReceive.length > 0 && (
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5 }}>
                    <span style={{ color: 'var(--arvo-fg-soft)', fontSize: 11.5 }}>{th.toReceive ?? 'a receber'} </span>
                    <span className="arvo-delta-pos" style={{ fontWeight: 600 }}>{balances.toReceive.map(b => fmtCur(b.amount, b.currency)).join(' + ')}</span>
                  </span>
                )}
                {balances.toPay.length > 0 && (
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5 }}>
                    <span style={{ color: 'var(--arvo-fg-soft)', fontSize: 11.5 }}>{th.toPay ?? 'a pagar'} </span>
                    <span className="arvo-delta-neg" style={{ fontWeight: 600 }}>{balances.toPay.map(b => fmtCur(b.amount, b.currency)).join(' + ')}</span>
                  </span>
                )}
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* Atalhos — pills pra ações e destinos que não estão no header */}
      <div>
        <p style={{ ...cardLabel, marginBottom: 11 }}>{th.shortcuts ?? 'Atalhos'}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" onClick={() => setSplitPicker(true)} style={pillStyle}>
            <svg width="17" height="17" fill="none" viewBox="0 0 16 16" stroke="var(--arvo-fg-soft)" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 4.5h9M2 4.5l2.5-2.5M2 4.5l2.5 2.5M14 11.5H5M14 11.5l-2.5-2.5M14 11.5l-2.5 2.5" />
            </svg>
            {th.splitExpense ?? 'Dividir despesa'}
          </button>
          {shortcuts.map(s => (
            <Link key={s.to} to={s.to} style={{ ...pillStyle, textDecoration: 'none' }}>
              <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-soft)" strokeWidth={1.7}>{s.icon}</svg>
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Seletor de amigo pra dividir despesa → abre o painel do momento oculto */}
      {splitPicker && !splitFriend && (
        <div onClick={() => setSplitPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.45)' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, maxHeight: '80vh', overflowY: 'auto', background: 'var(--arvo-surface)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-lg)', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <p style={{ flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>{th.splitWithWho ?? 'Dividir com quem?'}</p>
              <button type="button" onClick={() => setSplitPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" d="M1.5 1.5l11 11M12.5 1.5l-11 11" /></svg>
              </button>
            </div>
            {activeFriends.length === 0 ? (
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', lineHeight: 1.5 }}>
                {th.splitNoFriends ?? 'Você ainda não tem amigos conectados para dividir.'}{' '}
                <Link to="/people" style={{ color: '#8C6A28' }}>{t.nav.people} →</Link>
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {activeFriends.map(f => (
                  <button key={f.user_id} type="button" onClick={() => setSplitFriend(f)} className="w-full text-left flex items-center gap-3"
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
              </div>
            )}
          </div>
        </div>
      )}
      {splitFriend?.user_id && (
        <PairMomentModal
          friendUserId={splitFriend.user_id}
          friendName={splitFriend.name ?? splitFriend.email}
          initialMomentId={null}
          onClose={() => { setSplitFriend(null); setSplitPicker(false) }}
        />
      )}
    </div>
  )
}

/* Card de configuração colapsável na Hoje. Reusa o hook do checklist do header
   (mesma flag de dispensa e mesmo progresso) — só muda a apresentação. */
function SetupCard({ setup, firstName, onNavigate }: {
  setup: ReturnType<typeof useSetupChecklist>
  firstName?: string
  onNavigate: (to: string) => void
}) {
  const { t } = useI18n()
  const s = (t as unknown as Record<string, Record<string, string>>).setup
  const [collapsed, setCollapsed] = useState(false)
  const pct = setup.doneCount / setup.total
  const name = firstName?.split(' ')[0] ?? ''

  return (
    <div style={{
      borderRadius: 16, overflow: 'hidden',
      border: '1px solid rgba(27,79,216,0.28)',
      background: 'linear-gradient(150deg, rgba(27,79,216,0.07), var(--arvo-surface) 60%)',
    }}>
      <div style={{ padding: '15px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 16, color: 'var(--arvo-fg)' }}>
            {name ? `${name}, ` : ''}{s.title}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8 }}>
            <div style={{ flex: 1, maxWidth: 240, height: 4, background: 'rgba(27,79,216,0.14)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct * 100}%`, background: '#1B4FD8', borderRadius: 2, transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, fontWeight: 600, color: '#1B4FD8' }}>{setup.doneCount}/{setup.total}</span>
          </div>
        </div>
        <button onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'expandir' : 'recolher'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--arvo-fg-soft)', flexShrink: 0 }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }}><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: '2px 10px 8px' }}>
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
