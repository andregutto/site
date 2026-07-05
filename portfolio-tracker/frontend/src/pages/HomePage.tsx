import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { PageLoader } from '../components/ArvoLoader'
import CategoryIcon from './community/_shared/CategoryIcon'
import type { PortfolioValue } from '../lib/types'

/* Página "Hoje": abertura do app sem valores na cara. Saudação, o que está
   vivo agora (comunidade, viagem, momento) e atalhos. Patrimônio só ao tocar. */

interface TodayData {
  first_name: string
  hot_topics: Array<{ id: number; title: string; category_slug: string; category_name: string | null; reply_count: number; last_post_at: string }>
  next_trip: { id: number; title: string; destination: string | null; start_date: string; end_date: string | null; ongoing: boolean } | null
  active_moment: { id: number; name: string; icon: string; color: string; start_date: string | null; end_date: string | null; ongoing: boolean } | null
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

const card: React.CSSProperties = { background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 14 }
const cardLabel: React.CSSProperties = { fontFamily: 'var(--arvo-font-body)', fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }

export default function HomePage() {
  const { t, locale } = useI18n()
  const th = (t as any).home ?? {}
  const navigate = useNavigate()
  const { fmt } = useCurrency()

  const [data, setData] = useState<TodayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [wealth, setWealth] = useState<number | null>(null)
  const [wealthLoading, setWealthLoading] = useState(false)

  useEffect(() => {
    apiFetch<TodayData>('/home/today')
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  async function revealWealth() {
    if (wealthLoading || wealth != null) return
    setWealthLoading(true)
    try {
      const v = await apiFetch<PortfolioValue>('/portfolio/value')
      setWealth(v.total_brl)
    } finally {
      setWealthLoading(false)
    }
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? (th.morning ?? 'Bom dia') : hour < 19 ? (th.afternoon ?? 'Boa tarde') : (th.evening ?? 'Boa noite')
  const intlLocale = locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US'
  const dateLine = new Intl.DateTimeFormat(intlLocale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  const shortcuts = [
    { to: '/dashboard', label: t.nav.investments, icon: <path strokeLinecap="round" d="M3 20h18M5 20v-7M10 20V9M15 20v-5M20 20V5" /> },
    { to: '/finances', label: t.nav.finances, icon: <><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 7v10M14.5 9.3c-.5-.9-1.4-1.4-2.5-1.4-1.5 0-2.6.9-2.6 2.1s1.1 1.7 2.6 2 2.7.9 2.7 2.1-1.1 2.1-2.7 2.1c-1.1 0-2.1-.5-2.6-1.4" /></> },
    { to: '/voyage', label: (t as any).nav?.voyage ?? 'Viagens', icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-3.3 0-6 2.7-6 6 0 4.5 6 12 6 12s6-7.5 6-12c0-3.3-2.7-6-6-6Z" /><circle cx="12" cy="9" r="2.2" /></> },
    { to: '/community', label: (t as any).nav?.community ?? 'Comunidade', icon: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19.5v-1a5.5 5.5 0 0 1 11 0v1M15.5 13.2a4.3 4.3 0 0 1 5 4.2v1.1" /></> },
    { to: '/messages', label: (t as any).nav?.messages ?? 'Mensagens', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v11H9l-5 4V5Z" /> },
    { to: '/people', label: t.nav.people, icon: <><circle cx="12" cy="8" r="3.2" /><path strokeLinecap="round" strokeLinejoin="round" d="M5.5 20v-.8a6.5 6.5 0 0 1 13 0v.8" /></> },
  ]

  if (loading) return <PageLoader />

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Saudação */}
      <div>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>{dateLine}</p>
        <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 30, color: 'var(--arvo-fg)', marginTop: 4 }}>
          {greeting}{data?.first_name ? `, ${data.first_name}` : ''}
        </h1>
      </div>

      {/* Patrimônio: só ao tocar */}
      <div style={{ ...card, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={cardLabel}>{th.wealthLabel ?? 'Patrimônio'}</p>
          <p className="arvo-num" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 24, color: 'var(--arvo-fg)', marginTop: 4 }}>
            {wealth != null ? fmt(wealth, 0) : '•••••'}
          </p>
        </div>
        {wealth == null ? (
          <button
            onClick={revealWealth}
            disabled={wealthLoading}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '9px 18px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg-muted)', cursor: 'pointer', opacity: wealthLoading ? 0.5 : 1 }}
          >
            {wealthLoading ? '...' : (th.reveal ?? 'Mostrar')}
          </button>
        ) : (
          <Link to="/dashboard" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '9px 18px', borderRadius: 999, background: 'var(--arvo-pill-active-bg)', color: 'var(--arvo-pill-active-fg)', textDecoration: 'none' }}>
            {th.openDashboard ?? 'Ver dashboard'}
          </Link>
        )}
      </div>

      {/* Comunidade: tópicos quentes */}
      {data && data.hot_topics.length > 0 && (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '13px 18px 9px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={cardLabel}>{th.communityLabel ?? 'Na comunidade'}</p>
            <Link to="/community" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: '#E8A020', textDecoration: 'none' }}>{th.seeAll ?? 'Ver tudo'} →</Link>
          </div>
          {data.hot_topics.map(topic => (
            <button
              key={topic.id}
              onClick={() => navigate(`/community/${topic.category_slug}/${topic.id}`)}
              className="w-full text-left flex items-center gap-3"
              style={{ padding: '10px 18px', borderTop: '1px solid var(--arvo-border-soft, var(--arvo-border))', background: 'none', border: 'none', borderTopStyle: 'solid', cursor: 'pointer' }}
            >
              <span style={{ color: 'var(--arvo-fg-muted)', display: 'inline-flex', flexShrink: 0 }}><CategoryIcon slug={topic.category_slug} size={14} /></span>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.title}</span>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', flexShrink: 0 }}>{timeAgo(topic.last_post_at)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Viagem + Momento lado a lado */}
      {(data?.next_trip || data?.active_moment) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data?.next_trip && (
            <Link to="/voyage" style={{ ...card, padding: '14px 18px', textDecoration: 'none', display: 'block' }}>
              <p style={cardLabel}>{data.next_trip.ongoing ? (th.tripNow ?? 'Viagem em andamento') : (th.tripNext ?? 'Próxima viagem')}</p>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 18, color: 'var(--arvo-fg)', marginTop: 6 }}>{data.next_trip.title}</p>
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', marginTop: 3 }}>
                {data.next_trip.destination ? `${data.next_trip.destination} · ` : ''}
                {new Date(data.next_trip.start_date + 'T00:00:00').toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' })}
                {data.next_trip.end_date ? ` – ${new Date(data.next_trip.end_date + 'T00:00:00').toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' })}` : ''}
              </p>
            </Link>
          )}
          {data?.active_moment && (
            <Link to="/finances/moments" style={{ ...card, padding: '14px 18px', textDecoration: 'none', display: 'block' }}>
              <p style={cardLabel}>{data.active_moment.ongoing ? (th.momentLabel ?? 'Momento em andamento') : (th.momentNext ?? 'Próximo momento')}</p>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 18, color: 'var(--arvo-fg)', marginTop: 6 }}>{data.active_moment.name}</p>
              {data.active_moment.end_date && (
                <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', marginTop: 3 }}>
                  {(th.until ?? 'até')} {new Date(data.active_moment.end_date + 'T00:00:00').toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' })}
                </p>
              )}
            </Link>
          )}
        </div>
      )}

      {/* Atalhos */}
      <div>
        <p style={{ ...cardLabel, marginBottom: 10 }}>{th.shortcuts ?? 'Atalhos'}</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {shortcuts.map(s => (
            <Link key={s.to} to={s.to} style={{ ...card, padding: '14px 8px', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-muted)" strokeWidth={1.6}>{s.icon}</svg>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-muted)', textAlign: 'center' }}>{s.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
