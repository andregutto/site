import { useState } from 'react'
import { useI18n } from '../contexts/I18nContext'
import { useUpgrade, type Entitlements, type GateTier } from '../contexts/UpgradeContext'
import { PageLoader } from '../components/ArvoLoader'
import UpgradeCta from '../components/upgrade/UpgradeCta'
import UpgradeArt from '../components/upgrade/UpgradeArt'
import TierBadge from '../components/upgrade/TierBadge'
import { ROW_ORDER, INCLUDED_ROWS, USER_TIERS, TIER_RANK, tierLabel, tierTagline } from '../components/upgrade/tierMeta'

// Quantas linhas "on" (incluídas/liberadas) mostrar antes de esconder o resto
// atrás de "Ver lista completa". O dono pediu ~6-7 mais relevantes visíveis.
const VISIBLE_LIMIT = 7

// Página /planos — sempre-dark premium, estilo pricing da Finary: 3 cards de
// tier lado a lado (Free / Plus / Pro), cada um com nome, tagline e a lista de
// capacidades (✓ / —) derivada da matriz do GET /api/entitlements. Badge no
// plano atual, CTA "avisar quando abrir" nos pagos. Sem preços, sem Beta.
// Ver docs/TIERS_PLAN.md.

// Como cada capacidade se resolve para uma coluna de tier: texto + se é "on".
function cell(
  rowKey: string,
  tier: GateTier,
  ent: Entitlements,
  labels: { yes: string; no: string; unlimited: string; perDay: string; perMonth: string; accounts: string },
): { text: string; on: boolean } {
  const quota = ent.quotas[rowKey]
  if (quota) {
    const limit = quota.limits[tier]
    if (limit === null) return { text: labels.unlimited, on: true }
    if (limit === 0) return { text: labels.no, on: false }
    const suffix = quota.period === 'day' ? labels.perDay
      : quota.period === 'month' ? labels.perMonth
      : quota.period === 'live' && rowKey === 'import_accounts' ? ` ${labels.accounts}`
      : ''
    return { text: `${limit}${suffix}`, on: true }
  }
  const required = ent.gates[rowKey]
  if (!required) return { text: labels.no, on: false }
  const on = required === 'free' || TIER_RANK[tier] >= TIER_RANK[required]
  return { text: on ? labels.yes : labels.no, on }
}

interface Row { key: string; label: string; on: boolean; text: string }

function TierCard({
  tier, entitlements, rows, included, labels, s, isCurrent,
}: {
  tier: GateTier
  entitlements: Entitlements
  rows: Record<string, string>
  included: Record<string, string>
  labels: { yes: string; no: string; unlimited: string; perDay: string; perMonth: string; accounts: string }
  s: Record<string, any>
  isCurrent: boolean
}) {
  const featured = tier === 'plus' // coluna que puxa o olho, como no Finary
  const [expanded, setExpanded] = useState(false)

  // Linhas incluídas (sempre ✓) primeiro, depois as da matriz. Ordena o resultado
  // "on primeiro, bloqueado por último" — o dono quer começar pelo que está
  // incluído e ir aumentando (padrão Finary).
  const includedRows: Row[] = INCLUDED_ROWS.map(k => ({ key: k, label: included[k] ?? k, on: true, text: labels.yes }))
  const matrixRows: Row[] = ROW_ORDER
    .filter(k => entitlements.gates[k] || entitlements.quotas[k])
    .map(k => {
      const { text, on } = cell(k, tier, entitlements, labels)
      return { key: k, label: rows[k] ?? k, on, text }
    })
  const allRows = [...includedRows, ...matrixRows]
  const onRows = allRows.filter(r => r.on)
  const offRows = allRows.filter(r => !r.on)
  const ordered = [...onRows, ...offRows]

  // Colapsado mostra até VISIBLE_LIMIT linhas "on"; se sobrar algo (mais on ou
  // qualquer off), oferece "Ver lista completa".
  const collapsedCount = Math.min(onRows.length, VISIBLE_LIMIT)
  const hasMore = ordered.length > collapsedCount
  const shown = expanded ? ordered : ordered.slice(0, collapsedCount)

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        background: featured
          ? 'radial-gradient(120% 60% at 50% 0%, #1c1811 0%, #121009 60%, #0D0D0D 100%)'
          : '#121110',
        border: featured ? '1px solid rgba(200,184,154,0.32)' : '1px solid rgba(200,184,154,0.12)',
        borderRadius: 18, padding: '22px 20px', position: 'relative', overflow: 'hidden',
        boxShadow: featured ? '0 20px 50px -24px rgba(0,0,0,0.6)' : 'none',
      }}
    >
      {featured && (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 40% at 50% 0%, rgba(200,184,154,0.12), transparent 70%)', pointerEvents: 'none' }} />
      )}
      <div style={{ position: 'relative' }}>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 20, letterSpacing: '0.06em', color: featured ? 'var(--arvo-gold)' : 'var(--arvo-fg-on-dark)' }}>
              {tierLabel(tier, s)}
            </span>
            {tier !== 'free' && <TierBadge tier={tier} size={14} onDark />}
          </div>
          {isCurrent && (
            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--arvo-black)', background: 'var(--arvo-gold)', borderRadius: 999, padding: '3px 9px' }}>
              {s.cardCurrentBadge ?? 'Seu plano'}
            </span>
          )}
        </div>
        {/* Tagline em DM Sans (body) regular — Playfair itálico deixava ilegível. */}
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, lineHeight: 1.5, color: 'rgba(242,237,228,0.66)', marginTop: 9, minHeight: 40 }}>
          {tierTagline(tier, s)}
        </p>

        <div style={{ height: 1, background: 'rgba(200,184,154,0.14)', margin: '14px 0 4px' }} />

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {shown.map(r => (
            <li key={r.key} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(200,184,154,0.07)' }}>
              <span style={{ flexShrink: 0, width: 14, textAlign: 'center', color: r.on ? 'var(--arvo-gold)' : 'rgba(242,237,228,0.28)', fontSize: 13 }}>
                {r.on ? '✓' : '—'}
              </span>
              <span style={{ flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, lineHeight: 1.4, color: r.on ? 'rgba(242,237,228,0.88)' : 'rgba(242,237,228,0.4)' }}>
                {r.label}
              </span>
              {r.on && r.text !== labels.yes && (
                <span style={{ flexShrink: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--arvo-gold)' }}>
                  {r.text}
                </span>
              )}
            </li>
          ))}
        </ul>

        {hasMore && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.02em', color: 'var(--arvo-gold)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {expanded ? (s.showLess ?? 'Ver menos') : (s.seeFullList ?? 'Ver lista completa')}
            <span style={{ display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms', fontSize: 10 }}>▾</span>
          </button>
        )}

        {tier !== 'free' && (
          <div style={{ marginTop: 18 }}>
            {isCurrent
              ? null
              : <UpgradeCta gate={`plan_${tier}`} dark showPlansLink={false} showSubcopy={false} />}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PlansPage() {
  const { t } = useI18n()
  const s = ((t as any).upgrade ?? {}) as Record<string, any>
  const rows = ((t as any).upgrade?.rows ?? {}) as Record<string, string>
  const included = ((t as any).upgrade?.included ?? {}) as Record<string, string>
  const { entitlements, loading } = useUpgrade()

  if (loading && !entitlements) return <PageLoader />

  const currentTier = entitlements?.tier ?? 'free'
  const labels = {
    yes: '✓', no: '—',
    unlimited: s.unlimited ?? '∞',
    perDay: s.perDay ?? '/dia',
    perMonth: s.perMonth ?? '/mês',
    accounts: s.accounts ?? 'contas',
  }

  return (
    <div
      style={{
        margin: '-16px', // encosta o dark nas bordas do container claro do app
        minHeight: 'calc(100vh - 0px)',
        background: 'radial-gradient(140% 60% at 50% 0%, #17140f 0%, #0D0D0D 55%)',
        padding: '32px 16px calc(48px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: 30, borderRadius: 22, overflow: 'hidden', minHeight: 232, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(200,184,154,0.12)' }}>
          {/* Hero: foto autoral Pro (floresta escura c/ feixe dourado), tratada
              dark — compõe com dourado sobre dark melhor que a composição CSS. */}
          <UpgradeArt tier="pro" showWordmark={false} photoOpacity={0.5} style={{ position: 'absolute', inset: 0, borderRadius: 0 }} />
          <div style={{ position: 'relative', padding: '40px 20px' }}>
            <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--arvo-gold)', marginBottom: 12 }}>
              {s.plansEyebrow ?? 'Planos'}
            </div>
            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 32, lineHeight: 1.14, color: 'var(--arvo-fg-on-dark)', maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
              {s.plansTitle ?? 'Escolha quanto o Arvo faz por você'}
            </h1>
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, lineHeight: 1.6, color: 'rgba(242,237,228,0.72)', marginTop: 14, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
              {s.plansIntro ?? 'Você já faz parte da comunidade. Os planos ampliam o que o Arvo automatiza, conecta e analisa por você — e abrem em breve.'}
            </p>
          </div>
        </div>

        {entitlements && (
          <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16, alignItems: 'start' }}>
            {USER_TIERS.map(tier => (
              <TierCard
                key={tier}
                tier={tier}
                entitlements={entitlements}
                rows={rows}
                included={included}
                labels={labels}
                s={s}
                isCurrent={currentTier === tier}
              />
            ))}
          </div>
        )}

        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, lineHeight: 1.6, color: 'rgba(242,237,228,0.55)', textAlign: 'center', marginTop: 26, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
          {s.notifySubcopy ?? 'Os upgrades ainda não estão à venda. Quem registra interesse fica sabendo primeiro quando abrirem.'}
        </p>
      </div>
    </div>
  )
}
