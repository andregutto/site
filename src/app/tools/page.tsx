'use client'

import { useState, useEffect } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { useTranslation } from '@/lib/i18n'
import { SQHeader } from '@/components/sq/SQHeader'
import { SQFooter } from '@/components/sq/SQFooter'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

interface Stats { clients: number; mrr: number; runs: number; prospects: number }

export default function ToolsDashboard() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/sq/clients').then(r => r.json()),
      fetch('/api/sq/runs').then(r => r.json()),
    ]).then(([cd, rd]) => {
      const clients: any[] = cd.clients ?? []
      const runs:    any[] = rd.runs    ?? []
      const prospects = runs.reduce((s: number, r: any) => s + (r.total_prospects ?? 0), 0)
      const mrr = clients
        .filter((c: any) => c.status === 'actif' || c.status === 'gagne')
        .reduce((s: number, c: any) => s + (c.monthly_value ?? 0), 0)
      setStats({ clients: clients.length, mrr, runs: runs.length, prospects })
    }).catch(() => {})
  }, [])

  const TOOLS = [
    {
      num: '01', titleKey: 'dash_tool_prospection_title' as const,
      descKey: 'dash_tool_prospection_desc' as const,
      href: '/tools/prospect',
      statValue: stats ? String(stats.prospects) : null,
      statKey: 'dash_stat_prospects' as const,
    },
    {
      num: '02', titleKey: 'dash_tool_history_title' as const,
      descKey: 'dash_tool_history_desc' as const,
      href: '/tools/prospect/historique',
      statValue: stats ? String(stats.runs) : null,
      statKey: 'dash_stat_runs' as const,
    },
    {
      num: '03', titleKey: 'dash_tool_crm_title' as const,
      descKey: 'dash_tool_crm_desc' as const,
      href: '/tools/clients',
      statValue: stats ? String(stats.clients) : null,
      statKey: 'dash_stat_clients' as const,
    },
    {
      num: '04', title: 'Calendrier', desc: 'Vue globale du calendrier éditorial de tous vos clients, avec filtres par client et par plateforme.', href: '/tools/calendrier', statValue: null, statKey: null,
    },
    {
      num: '05', title: 'Finances', desc: 'Suivi des factures, contrôle des paiements, balance mensuelle et flux de trésorerie.', href: '/tools/finances', statValue: stats ? (stats.mrr > 0 ? stats.mrr.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : null) : null, statKey: null,
    },
    {
      num: '06', title: 'Services', desc: 'Catalogue des services proposés — prix, descriptions, activation. Référence pour les devis et analyses.', href: '/tools/services', statValue: null, statKey: null,
    },
    {
      num: '07', title: 'Paramètres', desc: 'Informations de l\'agence, régime fiscal (auto-entrepreneur / société), configuration appliquée sur toutes les factures.', href: '/tools/parametres', statValue: null, statKey: null,
    },
  ]

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>

      <SQHeader />

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 96px' }}>

        {/* Section label */}
        <div style={{ marginBottom: 48 }}>
          <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, fontWeight: 700, color: C.ink }}>
            {t('dash_section')}
          </span>
          <div style={{ height: '0.5px', background: C.ink, marginTop: 14 }} />
        </div>

        {/* Stats strip */}
        {stats && (
          <div style={{ display: 'flex', gap: 0, marginBottom: 56, border: `0.5px solid ${C.ink}` }}>
            {[
              { value: stats.prospects, label: t('dash_stat_prospects') },
              { value: stats.runs,      label: t('dash_stat_runs')      },
              { value: stats.clients,   label: t('dash_stat_clients')   },
              ...(stats.mrr > 0 ? [{ value: stats.mrr.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }), label: t('dash_stat_mrr') }] : []),
            ].map((s, i, arr) => (
              <div key={i} style={{
                flex: 1, padding: '28px 32px',
                borderRight: i < arr.length - 1 ? `0.5px solid ${C.ink}` : 'none',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <span style={{ fontFamily: sans, fontVariantNumeric: 'tabular-nums', fontSize: 36, fontWeight: 300, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {s.value}
                </span>
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 600, color: C.muted }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tool cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
          {TOOLS.map((tool, i) => {
            const title = (tool as any).title ?? t((tool as any).titleKey)
            const desc  = (tool as any).desc  ?? t((tool as any).descKey)
            return (
              <a
                key={tool.num}
                href={tool.href}
                style={{
                  textDecoration: 'none', display: 'flex', flexDirection: 'column',
                  padding: '36px 36px 32px',
                  border: `0.5px solid ${C.ink}`,
                  borderLeft: i % 3 === 0 ? `0.5px solid ${C.ink}` : 'none',
                  borderTop: i >= 3 ? `0.5px solid ${C.ink}` : `0.5px solid ${C.ink}`,
                  background: C.paper, cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = C.warm)}
                onMouseLeave={e => (e.currentTarget.style.background = C.paper)}
              >
                <span style={{ fontFamily: sans, fontSize: 11, letterSpacing: '0.08em', color: C.muted, marginBottom: 20 }}>
                  {tool.num}
                </span>
                <span className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', fontSize: 36, lineHeight: 0.92, color: C.ink, marginBottom: 16 }}>
                  {title}
                </span>
                <span style={{ fontFamily: sans, fontSize: 13, color: C.ink, lineHeight: 1.65, flex: 1, marginBottom: 28 }}>
                  {desc}
                </span>
                {tool.statValue !== null && (
                  <div style={{ marginBottom: 20, paddingTop: 18, borderTop: `0.5px solid rgba(28,25,23,0.15)` }}>
                    <span style={{ fontFamily: sans, fontVariantNumeric: 'tabular-nums', fontSize: 24, color: C.ink, letterSpacing: '-0.01em' }}>
                      {tool.statValue}
                    </span>
                    {(tool as any).statKey && (
                      <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 10, color: C.muted, marginLeft: 10 }}>
                        {t((tool as any).statKey)}
                      </span>
                    )}
                  </div>
                )}
                <span style={{
                  fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, fontWeight: 700,
                  color: C.paper, background: C.accent, padding: '8px 16px',
                  display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 8,
                }}>
                  {t('dash_access')} →
                </span>
              </a>
            )
          })}
        </div>

      </main>
      <SQFooter />
    </div>
  )
}
