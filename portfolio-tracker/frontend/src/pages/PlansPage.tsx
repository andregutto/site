import { useState } from 'react'
import { useI18n } from '../contexts/I18nContext'
import { useTheme } from '../contexts/ThemeContext'
import { useUpgrade, type Entitlements, type GateTier } from '../contexts/UpgradeContext'
import { PageLoader } from '../components/ArvoLoader'
import UpgradeCta from '../components/upgrade/UpgradeCta'
import UpgradeArt from '../components/upgrade/UpgradeArt'
import TierBadge from '../components/upgrade/TierBadge'
import { ROW_ORDER, INCLUDED_ROWS, DELTA_ROWS, USER_TIERS, TIER_RANK, tierLabel, tierTagline } from '../components/upgrade/tierMeta'
import { Icon } from '../components/icons'

// Quantas linhas "on" (incluídas/liberadas) mostrar antes de esconder o resto
// atrás de "Ver lista completa". O dono pediu ~6-7 mais relevantes visíveis.
const VISIBLE_LIMIT = 7

// Página /planos — estilo pricing da Finary: 3 cards de tier lado a lado
// (Free / Plus / Pro), cada um com nome, tagline e a lista de capacidades
// (✓ / ✕ esmaecido) derivada da matriz do GET /api/entitlements, no modelo
// "delta" (Plus/Pro mostram só o que acrescentam). Badge no plano atual,
// CTA "avisar quando abrir" nos pagos. Sem preços, sem Beta.
// As superfícies (página, cards, listas) SEGUEM o tema do app (vars --arvo-*):
// claras no light, escuras no dark. Só o hero tem foto autoral tratada dark
// com texto claro dentro dela — foto é elemento, não tema. Ver docs/TIERS_PLAN.md.

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
// Linha "cabeçalho" do delta ("Tudo do Free, e mais:") — renderizada em
// destaque, sem marcador de ✓/✕.
interface HeadingRow { heading: string }
type ListRow = Row | HeadingRow
const isHeading = (r: ListRow): r is HeadingRow => 'heading' in r

function TierCard({
  tier, entitlements, rows, included, labels, s, isCurrent, onDark,
}: {
  tier: GateTier
  entitlements: Entitlements
  rows: Record<string, string>
  included: Record<string, string>
  labels: { yes: string; no: string; unlimited: string; perDay: string; perMonth: string; accounts: string }
  s: Record<string, any>
  isCurrent: boolean
  onDark: boolean
}) {
  const featured = tier === 'plus' // coluna que puxa o olho, como no Finary
  const [expanded, setExpanded] = useState(false)

  // Cromo por tema. No dark mantém o visual aprovado (gradientes/rgba claros);
  // no light usa superfície clara do tema, texto --arvo-fg e ouro legível.
  // A borda dourada do card featured funciona nos dois modos (--arvo-gold é ok
  // como BORDA em claro, só não como texto).
  const cardBg = onDark
    ? (featured
        ? 'radial-gradient(120% 60% at 50% 0%, #1c1811 0%, #121009 60%, #0D0D0D 100%)'
        : '#121110')
    : 'var(--arvo-surface)'
  const cardBorder = featured ? '1px solid var(--arvo-gold)' : '1px solid var(--arvo-border)'
  const cardShadow = featured
    ? (onDark ? '0 20px 50px -24px rgba(0,0,0,0.6)' : 'var(--arvo-shadow-lg)')
    : (onDark ? 'none' : 'var(--arvo-shadow-sm)')
  const goldAccent = onDark ? 'var(--arvo-gold)' : 'var(--arvo-gold-text)'
  const tierNameColor = featured ? goldAccent : (onDark ? 'var(--arvo-fg-on-dark)' : 'var(--arvo-fg)')
  const taglineColor = onDark ? 'rgba(242,237,228,0.66)' : 'var(--arvo-fg-muted)'
  const dividerColor = onDark ? 'rgba(200,184,154,0.14)' : 'var(--arvo-border)'
  const rowBorder = onDark ? 'rgba(200,184,154,0.07)' : 'var(--arvo-border-soft)'
  const onLabelColor = onDark ? 'rgba(242,237,228,0.88)' : 'var(--arvo-fg)'
  const offLabelColor = onDark ? 'rgba(242,237,228,0.4)' : 'var(--arvo-fg-soft)'
  const offMarkColor = onDark ? 'rgba(242,237,228,0.28)' : 'var(--arvo-fg-faint)'

  // Monta a lista conforme o modelo "delta" (padrão Finary/Stripe):
  //  - Free: capacidades incluídas + liberadas (✓), depois o que NÃO tem
  //    (✕ esmaecido) — gera vontade de assinar. Recolhe além do VISIBLE_LIMIT.
  //  - Plus/Pro: cabeçalho "Tudo do <anterior>, e mais:" + SÓ o delta (✓),
  //    ordenado por desejo (DELTA_ROWS). Sem parede de ✕, sem recolher.
  const mkRow = (k: string): Row => {
    const { text, on } = cell(k, tier, entitlements, labels)
    return { key: k, label: rows[k] ?? k, on, text }
  }

  let ordered: ListRow[]
  let hasMore = false
  let shown: ListRow[]

  if (tier === 'free') {
    const includedRows: Row[] = INCLUDED_ROWS.map(k => ({ key: k, label: included[k] ?? k, on: true, text: labels.yes }))
    const matrixRows: Row[] = ROW_ORDER
      .filter(k => entitlements.gates[k] || entitlements.quotas[k])
      .map(mkRow)
    const all = [...includedRows, ...matrixRows]
    const onRows = all.filter(r => r.on)
    const offRows = all.filter(r => !r.on)
    ordered = [...onRows, ...offRows]
    // Colapsado mostra até VISIBLE_LIMIT linhas "on"; se sobrar algo, oferece
    // "Ver lista completa" (que revela o restante, inclusive os ✕).
    const collapsedCount = Math.min(onRows.length, VISIBLE_LIMIT)
    hasMore = ordered.length > collapsedCount
    shown = expanded ? ordered : ordered.slice(0, collapsedCount)
  } else {
    const prevLabel = tier === 'plus' ? tierLabel('free', s) : tierLabel('plus', s)
    const heading = (s.everythingIn ?? 'Tudo do {tier}, e mais:').replace('{tier}', prevLabel)
    const deltaRows: Row[] = DELTA_ROWS[tier]
      .filter(k => entitlements.gates[k] || entitlements.quotas[k])
      .map(mkRow)
      .filter(r => r.on) // delta é sempre o que o tier ADICIONA (on)
    ordered = [{ heading }, ...deltaRows]
    shown = ordered
  }

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        background: cardBg,
        border: cardBorder,
        borderRadius: 18, padding: '22px 20px', position: 'relative', overflow: 'hidden',
        boxShadow: cardShadow,
      }}
    >
      {/* Glow interno só faz sentido sobre superfície escura. */}
      {featured && onDark && (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 40% at 50% 0%, rgba(200,184,154,0.12), transparent 70%)', pointerEvents: 'none' }} />
      )}
      <div style={{ position: 'relative' }}>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 20, letterSpacing: '0.06em', color: tierNameColor }}>
              {tierLabel(tier, s)}
            </span>
            {tier !== 'free' && <TierBadge tier={tier} size={14} onDark={onDark} />}
          </div>
          {isCurrent && (
            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--arvo-black)', background: 'var(--arvo-gold)', borderRadius: 999, padding: '3px 9px' }}>
              {s.cardCurrentBadge ?? 'Seu plano'}
            </span>
          )}
        </div>
        {/* Tagline em DM Sans (body) regular — Fraunces é a serifada de destaque (Playfair foi eliminada por ilegível). */}
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, lineHeight: 1.5, color: taglineColor, marginTop: 9, minHeight: 42 }}>
          {tierTagline(tier, s)}
        </p>

        <div style={{ height: 1, background: dividerColor, margin: '14px 0 4px' }} />

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {shown.map((r, i) => (
            isHeading(r) ? (
              <li key={`h-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0 6px', fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 700, letterSpacing: '0.01em', color: goldAccent }}>
                {r.heading}
              </li>
            ) : (
              <li key={r.key} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0', borderBottom: `1px solid ${rowBorder}` }}>
                <span style={{ flexShrink: 0, width: 14, display: 'inline-flex', justifyContent: 'center', color: r.on ? goldAccent : offMarkColor, transform: 'translateY(2px)' }}>
                  {r.on ? <span style={{ fontSize: 13 }}>✓</span> : <Icon name="x" size={11} strokeWidth={1.75} />}
                </span>
                <span style={{ flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 14, lineHeight: 1.4, color: r.on ? onLabelColor : offLabelColor }}>
                  {r.label}
                </span>
                {r.on && r.text !== labels.yes && (
                  <span style={{ flexShrink: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 13, fontWeight: 600, color: goldAccent }}>
                    {r.text}
                  </span>
                )}
              </li>
            )
          ))}
        </ul>

        {hasMore && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, fontWeight: 600, letterSpacing: '0.02em', color: goldAccent, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {expanded ? (s.showLess ?? 'Ver menos') : (s.seeFullList ?? 'Ver lista completa')}
            <span style={{ display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms', fontSize: 10 }}>▾</span>
          </button>
        )}

        {tier !== 'free' && (
          <div style={{ marginTop: 18 }}>
            {isCurrent
              ? null
              : <UpgradeCta gate={`plan_${tier}`} dark={onDark} showPlansLink={false} showSubcopy={false} />}
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
  const { resolvedTheme } = useTheme()
  const onDark = resolvedTheme === 'dark'

  if (loading && !entitlements) return <PageLoader />

  const currentTier = entitlements?.tier ?? 'free'
  const labels = {
    // `no` nunca é exibido (linhas off usam o ✕ como marcador e não renderizam
    // texto de valor); string vazia evita qualquer travessão vazando na UI.
    yes: '✓', no: '',
    unlimited: s.unlimited ?? 'Ilimitado',
    perDay: s.perDay ?? '/dia',
    perMonth: s.perMonth ?? '/mês',
    accounts: s.accounts ?? 'contas',
  }

  return (
    <div
      style={{
        margin: '-16px', // encosta o fundo nas bordas do container do app
        minHeight: 'calc(100vh - 0px)',
        // Segue o tema: gradiente dark aprovado no dark; superfície clara do app
        // no light. Só o hero (abaixo) mantém foto autoral tratada dark.
        background: onDark
          ? 'radial-gradient(140% 60% at 50% 0%, #17140f 0%, #0D0D0D 55%)'
          : 'var(--arvo-bg)',
        padding: '32px 16px calc(48px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: 30, borderRadius: 22, overflow: 'hidden', minHeight: 'clamp(118px, 24vw, 232px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(200,184,154,0.12)' }}>
          {/* Hero: foto autoral Pro (floresta escura c/ feixe dourado), tratada
              dark — compõe com dourado sobre dark melhor que a composição CSS. */}
          <UpgradeArt tier="pro" showWordmark={false} photoOpacity={0.5} style={{ position: 'absolute', inset: 0, borderRadius: 0 }} />
          {/* Hero compacto no mobile (padding e fontes via clamp): o usuário
              quer ver os planos logo; o subtítulo em Fraunces some abaixo de
              sm (o copy completo mora nos cards e o mobile ganha ~90px). */}
          <div className="py-4 sm:py-10" style={{ position: 'relative', paddingLeft: 20, paddingRight: 20 }}>
            <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--arvo-gold)', marginBottom: 10 }}>
              {s.plansEyebrow ?? 'Planos'}
            </div>
            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 'clamp(17px, 4.6vw, 32px)', lineHeight: 1.2, whiteSpace: 'nowrap', color: 'var(--arvo-fg-on-dark)', maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
              {s.plansTitle ?? 'Escolha quanto o Arvo faz por você'}
            </h1>
            <p className="hidden sm:block" style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 17.5, lineHeight: 1.65, color: 'var(--arvo-gold)', marginTop: 14, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
              {s.plansIntro ?? 'Você já faz parte da comunidade. Os planos ampliam o que o Arvo automatiza, conecta e analisa por você. Upgrades em breve.'}
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
                onDark={onDark}
              />
            ))}
          </div>
        )}

        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, lineHeight: 1.6, color: onDark ? 'rgba(242,237,228,0.55)' : 'var(--arvo-fg-soft)', textAlign: 'center', marginTop: 26, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
          {s.notifySubcopy ?? 'Os upgrades ainda não estão à venda. Quem registra interesse fica sabendo primeiro quando abrirem.'}
        </p>
      </div>
    </div>
  )
}
