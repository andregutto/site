'use client'

import { useState, useEffect } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { useTranslation } from '@/lib/i18n'
import { LangSwitcher } from '@/components/sq/LangSwitcher'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })
const C = { paper: '#FDFAF5', ink: '#1C1917', warm: '#F4F0E6', muted: '#6B6760' }
const sans = 'Arial, "Helvetica Neue", Helvetica, sans-serif'

interface Stats {
  clients:   number
  mrr:       number
  runs:      number
  prospects: number
}

export default function ToolsDashboard() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/sq/clients').then(r => r.json()),
      fetch('/api/sq/runs').then(r => r.json()),
    ]).then(([cd, rd]) => {
      const clients:   any[] = cd.clients ?? []
      const runs:      any[] = rd.runs    ?? []
      const prospects  = runs.reduce((s: number, r: any) => s + (r.total_prospects ?? 0), 0)
      const mrr        = clients
        .filter((c: any) => c.status === 'actif' || c.status === 'gagne')
        .reduce((s: number, c: any) => s + (c.monthly_value ?? 0), 0)
      setStats({ clients: clients.length, mrr, runs: runs.length, prospects })
    }).catch(() => {})
  }, [])

  const TOOLS = [
    {
      num:       '01',
      titleKey:  'dash_tool_prospection_title' as const,
      descKey:   'dash_tool_prospection_desc'  as const,
      href:      '/tools/prospect',
      statValue: stats ? String(stats.prospects) : null,
      statKey:   'dash_stat_prospects' as const,
      available: true,
    },
    {
      num:       '02',
      titleKey:  'dash_tool_history_title' as const,
      descKey:   'dash_tool_history_desc'  as const,
      href:      '/tools/prospect/historique',
      statValue: stats ? String(stats.runs) : null,
      statKey:   'dash_stat_runs' as const,
      available: true,
    },
    {
      num:       '03',
      titleKey:  'dash_tool_crm_title' as const,
      descKey:   'dash_tool_crm_desc'   as const,
      href:      '/tools/clients',
      statValue: stats ? String(stats.clients) : null,
      statKey:   'dash_stat_clients' as const,
      available: true,
    },
  ]

  const COMING_SOON = ['04', '05', '06']

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>

      {/* ── Header ── */}
      <header style={{ background: C.paper }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 36px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontFamily: sans, textTransform: 'lowercase', letterSpacing: '0.6em', fontSize: 13, color: C.muted, marginLeft: 2 }}>
              {t('studio')}
            </span>
            <span className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', fontSize: 52, lineHeight: 0.9, color: C.ink, marginTop: -2 }}>
              {t('quartier')}
            </span>
            <div style={{ width: '100%', height: '0.5px', background: C.ink, margin: '6px 0 4px' }} />
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>
              {t('tagline')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, paddingBottom: 4 }}>
            <LangSwitcher />
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>
              {t('internal_tool')}
            </span>
          </div>
        </div>
        <div style={{ height: '0.5px', background: C.ink, marginLeft: 48, marginRight: 48 }} />
      </header>

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 96px' }}>

        {/* ── Section label ── */}
        <div style={{ marginBottom: 48 }}>
          <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>
            {t('dash_section')}
          </span>
          <div style={{ height: '0.5px', background: C.ink, marginTop: 12 }} />
        </div>

        {/* ── Stats strip ── */}
        {stats && (
          <div style={{ display: 'flex', gap: 0, marginBottom: 64, borderTop: `0.5px solid ${C.ink}`, borderBottom: `0.5px solid ${C.ink}` }}>
            {[
              { value: stats.prospects, label: t('dash_stat_prospects') },
              { value: stats.runs,      label: t('dash_stat_runs')      },
              { value: stats.clients,   label: t('dash_stat_clients')   },
              ...(stats.mrr > 0 ? [{
                value: stats.mrr.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }),
                label: t('dash_stat_mrr'),
              }] : []),
            ].map((s, i) => (
              <div key={i} style={{
                flex: 1,
                padding: '24px 28px',
                borderRight: `0.5px solid ${C.ink}`,
                borderLeft: i === 0 ? 'none' : 'none',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <span style={{ fontFamily: sans, fontVariantNumeric: 'tabular-nums', fontSize: 28, fontWeight: 400, color: C.ink, letterSpacing: '-0.01em' }}>
                  {s.value}
                </span>
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 9, color: C.muted }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Tool cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>

          {TOOLS.map((tool, i) => (
            <a
              key={tool.num}
              href={tool.href}
              style={{
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
                padding: '32px 32px 28px',
                border: `0.5px solid ${C.ink}`,
                borderLeft: i === 0 ? `0.5px solid ${C.ink}` : 'none',
                background: C.paper,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.warm)}
              onMouseLeave={e => (e.currentTarget.style.background = C.paper)}
            >
              {/* Number */}
              <span style={{ fontFamily: sans, fontSize: 10, letterSpacing: '0.1em', color: C.muted, marginBottom: 20 }}>
                {tool.num}
              </span>

              {/* Title */}
              <span className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', fontSize: 32, lineHeight: 0.95, color: C.ink, marginBottom: 14 }}>
                {t(tool.titleKey)}
              </span>

              {/* Description */}
              <span style={{ fontFamily: sans, fontSize: 12, color: C.muted, lineHeight: 1.6, flex: 1, marginBottom: 24 }}>
                {t(tool.descKey)}
              </span>

              {/* Stat */}
              {tool.statValue !== null && (
                <div style={{ marginBottom: 20, paddingTop: 16, borderTop: `0.5px solid rgba(28,25,23,0.12)` }}>
                  <span style={{ fontFamily: sans, fontVariantNumeric: 'tabular-nums', fontSize: 20, color: C.ink }}>
                    {tool.statValue}
                  </span>
                  <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 9, color: C.muted, marginLeft: 8 }}>
                    {t(tool.statKey)}
                  </span>
                </div>
              )}

              {/* CTA */}
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.ink }}>
                {t('dash_access')}
              </span>
            </a>
          ))}

          {/* ── Coming soon placeholders ── */}
          {COMING_SOON.map((num, i) => (
            <div
              key={num}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '32px 32px 28px',
                border: `0.5px solid ${C.ink}`,
                borderLeft: 'none',
                borderTop: `0.5px solid ${C.ink}`,
                background: C.warm,
                opacity: 0.5,
              }}
            >
              <span style={{ fontFamily: sans, fontSize: 10, letterSpacing: '0.1em', color: C.muted, marginBottom: 20 }}>
                {num}
              </span>
              <span className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', fontSize: 32, lineHeight: 0.95, color: C.ink, marginBottom: 14 }}>
                {t('dash_coming_soon_title')}
              </span>
              <span style={{ fontFamily: sans, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                {t('dash_coming_soon_desc')}
              </span>
            </div>
          ))}

        </div>

      </main>
    </div>
  )
}
