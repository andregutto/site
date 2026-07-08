import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import { PageLoader } from '../components/ArvoLoader'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { ArvoTooltip, CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_SERIES } from '../components/charts'

// Aba Aquisição do /admin: dashboard consolidado da captação de leads —
// KPIs no topo, evolução mensal (12 meses) e a lista unificada de ímãs
// (recursos + viagens compartilhadas) com quebra por campanha. Dados do
// GET /admin/acquisition (shared-api/src/routes/acquisition.ts); substitui
// as métricas que ficavam espalhadas nos cards da aba Recursos.

const OCRE = '#E8A020'

interface MonthPoint { month: string; resource_signups: number; trip_signups: number; views: number }

interface Magnet {
  type: 'resource' | 'trip'
  id: number
  slug: string | null
  title: string
  subtitle: string
  is_published: boolean
  views: number
  unlocks: number | null
  signups: number
  by_campaign: Record<string, number>
}

interface AcquisitionData {
  totals: {
    leads: number
    leads_this_month: number
    views: number
    resources: { leads: number; views: number }
    trips: { leads: number; views: number }
  }
  monthly: MonthPoint[]
  magnets: Magnet[]
}

const card: React.CSSProperties = { background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 12 }

function conversionPct(signups: number, views: number): string {
  if (views <= 0) return '0%'
  return `${((signups / views) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

// Ícones dos dois tipos de ímã — documento (recurso) e pino de mapa (viagem),
// mesmo traço dos ícones inline do restante do admin.
function MagnetIcon({ type }: { type: Magnet['type'] }) {
  const color = type === 'resource' ? OCRE : 'var(--arvo-blue, #1B4FD8)'
  return (
    <span className="shrink-0 inline-flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--arvo-track-bg, rgba(13,13,13,0.05))', color }}>
      {type === 'resource' ? (
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ) : (
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </span>
  )
}

export default function AcquisitionAdminPage() {
  const { t, locale } = useI18n()
  const aq = (t as any).admin?.acquisition ?? {}
  const intlLocale = locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [data, setData] = useState<AcquisitionData | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<AcquisitionData>('/admin/acquisition')
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageLoader />
  if (error || !data) {
    return (
      <p style={{ ...card, fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', padding: 16 }}>
        {aq.loadError ?? 'Não foi possível carregar as métricas'}
      </p>
    )
  }

  const { totals, monthly, magnets } = data

  // 'AAAA-MM' → rótulo curto no idioma ativo ('jul.', 'ago.'...); em janeiro
  // (e no 1º ponto) o ano entra junto pra série de 12 meses não ficar ambígua.
  function monthTick(month: string, index: number): string {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1, 1)
    const label = d.toLocaleDateString(intlLocale, { month: 'short' }).replace('.', '')
    return (index === 0 || m === 1) ? `${label} ${String(y).slice(2)}` : label
  }

  const kpis = [
    { label: aq.kpiLeads ?? 'Leads totais', value: totals.leads.toLocaleString(intlLocale) },
    { label: aq.kpiLeadsMonth ?? 'Leads este mês', value: totals.leads_this_month.toLocaleString(intlLocale) },
    { label: aq.kpiViews ?? 'Visitas a gates', value: totals.views.toLocaleString(intlLocale) },
    { label: aq.kpiConversion ?? 'Conversão', value: conversionPct(totals.leads, totals.views) },
  ]

  const series = [
    { key: 'resource_signups', label: aq.seriesResources ?? 'Recursos', color: CHART_SERIES.ocre },
    { key: 'trip_signups', label: aq.seriesTrips ?? 'Viagens', color: CHART_SERIES.ibov },
    { key: 'views', label: aq.seriesViews ?? 'Visitas', color: 'var(--arvo-fg-soft)' },
  ]

  return (
    <div className="space-y-6">
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, padding: '14px 18px' }}>
            <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
              {k.label}
            </div>
            <div className="arvo-num" style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 26, color: 'var(--arvo-fg)', marginTop: 4 }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Evolução mensal ──────────────────────────────────────────────── */}
      <section style={{ ...card, padding: 20 }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)' }}>
              {aq.chartTitle ?? 'Evolução mensal'}
            </h2>
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', margin: '2px 0 0' }}>
              {aq.chartSubtitle ?? 'Cadastros atribuídos e visitas a gates nos últimos 12 meses'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {series.map(s => (
              <span key={s.key} className="inline-flex items-center gap-1.5" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ height: 260, marginTop: 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly} barCategoryGap="28%">
              <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="month"
                tick={CHART_AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v, i) => monthTick(String(v), i)}
              />
              <YAxis tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
              <Tooltip
                cursor={{ fill: 'rgba(13,13,13,0.04)' }}
                content={
                  <ArvoTooltip
                    labelFormatter={l => monthTick(String(l), 1)}
                    formatter={(v, _name, item) => {
                      const s = series.find(x => x.key === item.dataKey)
                      return [v.toLocaleString(intlLocale), s?.label ?? _name]
                    }}
                  />
                }
              />
              <Bar dataKey="resource_signups" stackId="signups" fill={CHART_SERIES.ocre} radius={[0, 0, 0, 0]} maxBarSize={28} />
              <Bar dataKey="trip_signups" stackId="signups" fill={CHART_SERIES.ibov} radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Line dataKey="views" type="monotone" stroke="var(--arvo-fg-soft)" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── Ímãs de leads ────────────────────────────────────────────────── */}
      <section style={{ ...card, padding: 20 }}>
        <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 17, color: 'var(--arvo-fg)' }}>
          {aq.magnetsTitle ?? 'Ímãs de leads'}
        </h2>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', margin: '2px 0 0' }}>
          {aq.magnetsSubtitle ?? 'Recursos e viagens compartilhadas, ordenados por cadastros'}
        </p>

        {magnets.length === 0 ? (
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', marginTop: 14 }}>
            {aq.empty ?? 'Nenhum ímã de leads ainda. Crie um recurso ou compartilhe uma viagem.'}
          </p>
        ) : (
          <div style={{ marginTop: 14 }}>
            {/* Cabeçalho das colunas numéricas */}
            <div
              className="grid items-center gap-2"
              style={{ gridTemplateColumns: 'minmax(0,1fr) 58px 66px 52px 24px', padding: '0 4px 8px', borderBottom: '1px solid var(--arvo-border)' }}
            >
              <span />
              {[aq.colViews ?? 'Visitas', aq.colSignups ?? 'Cadastros', aq.colConversion ?? 'Conv.'].map(h => (
                <span key={h} className="text-right" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
                  {h}
                </span>
              ))}
              <span />
            </div>

            {magnets.map(m => {
              const key = `${m.type}:${m.id}`
              const expanded = expandedKey === key
              const campaigns = Object.entries(m.by_campaign ?? {}).sort((a, b) => b[1] - a[1])
              return (
                <div key={key} style={{ borderBottom: '1px solid var(--arvo-border-soft, var(--arvo-border))' }}>
                  <button
                    type="button"
                    onClick={() => setExpandedKey(expanded ? null : key)}
                    className="grid items-center gap-2 w-full text-left"
                    style={{ gridTemplateColumns: 'minmax(0,1fr) 58px 66px 52px 24px', padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <MagnetIcon type={m.type} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="truncate" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>{m.title}</span>
                          {!m.is_published && (
                            <span className="shrink-0" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', border: '1px solid var(--arvo-border)', borderRadius: 999, padding: '1px 7px' }}>
                              {aq.draft ?? 'Rascunho'}
                            </span>
                          )}
                        </span>
                        <span className="block truncate" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>
                          {m.type === 'resource' ? (aq.typeResource ?? 'Recurso') : (aq.typeTrip ?? 'Viagem')} · {m.subtitle}
                        </span>
                      </span>
                    </span>
                    <span className="arvo-num text-right" style={{ fontSize: 13.5, color: 'var(--arvo-fg)' }}>{m.views.toLocaleString(intlLocale)}</span>
                    <span className="arvo-num text-right" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--arvo-fg)' }}>{m.signups.toLocaleString(intlLocale)}</span>
                    <span className="arvo-num text-right" style={{ fontSize: 13.5, color: 'var(--arvo-fg-soft)' }}>{conversionPct(m.signups, m.views)}</span>
                    <span className="flex justify-end" style={{ color: 'var(--arvo-fg-soft)' }}>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </button>

                  {/* Quebra por campanha (utm_campaign) — mesmo dado que os
                      cards de recurso mostravam como "Origem:", agora em
                      linhas expansíveis. */}
                  {expanded && (
                    <div style={{ padding: '0 4px 12px 40px' }}>
                      <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', marginBottom: 6 }}>
                        {aq.byCampaign ?? 'Origem por campanha'}
                      </div>
                      {campaigns.length === 0 ? (
                        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', margin: 0 }}>
                          {aq.noCampaign ?? 'Nenhuma origem registrada ainda'}
                        </p>
                      ) : (
                        <div className="space-y-1.5" style={{ maxWidth: 420 }}>
                          {campaigns.map(([campaign, count]) => (
                            <div key={campaign} className="flex items-center justify-between gap-3">
                              <span className="truncate" style={{ fontFamily: 'var(--arvo-font-mono, monospace)', fontSize: 12.5, color: 'var(--arvo-fg)' }}>{campaign}</span>
                              <span className="arvo-num shrink-0" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--arvo-fg)' }}>{count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
