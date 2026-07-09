import { useI18n } from '../../contexts/I18nContext'
import type { Entitlements, GateTier } from '../../contexts/UpgradeContext'
import { ROW_ORDER, USER_TIERS, tierLabel } from './tierMeta'

// Tabela comparativa Free/Plus/Pro (nunca Beta, nunca preços) gerada a partir
// da matriz de GET /api/entitlements. Compartilhada entre o UpgradeModal e a
// página /planos — MESMA fonte, mesmo layout. Ver docs/TIERS_PLAN.md.

interface Props {
  entitlements: Entitlements
  // Gate/quota disparador — sua linha ganha destaque. Opcional (na /planos não há).
  highlightRow?: string
  // Compacto: usado dentro do modal (fontes/paddings menores). Página usa false.
  compact?: boolean
}

// Como cada célula (gate/quota × tier) é renderizada.
function cellContent(
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
  // Gate: liberado se o tier da coluna alcança o requerido.
  const required = ent.gates[rowKey]
  if (!required) return { text: labels.no, on: false }
  const rank = { free: 0, plus: 1, pro: 2 }
  const on = required === 'free' || rank[tier] >= rank[required]
  return { text: on ? labels.yes : labels.no, on }
}

export default function TierComparisonTable({ entitlements, highlightRow, compact = false }: Props) {
  const { t } = useI18n()
  const s = ((t as any).upgrade ?? {}) as Record<string, any>
  const rows = ((t as any).upgrade?.rows ?? {}) as Record<string, string>
  const currentTier = entitlements.tier

  // Só linhas que de fato existem na matriz recebida (gate OU quota).
  const visibleRows = ROW_ORDER.filter(k => entitlements.gates[k] || entitlements.quotas[k])

  const labels = {
    yes: '✓',
    no: '—',
    unlimited: s.unlimited ?? '∞',
    perDay: s.perDay ?? '/dia',
    perMonth: s.perMonth ?? '/mês',
    accounts: s.accounts ?? 'contas',
  }

  const headPad = compact ? '8px 6px' : '12px 10px'
  const cellPad = compact ? '9px 6px' : '13px 10px'
  const labelFont = compact ? 12.5 : 14
  const cellFont = compact ? 12.5 : 14

  // Coluna do tier atual do usuário fica marcada (se for free/plus/pro; beta
  // não tem coluna — cai fora do destaque, o que é intencional).
  const currentCol: GateTier | null = (USER_TIERS as string[]).includes(currentTier) ? currentTier as GateTier : null

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: compact ? 300 : 420 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: headPad, position: 'sticky', left: 0, background: 'var(--arvo-surface)', zIndex: 1 }} />
            {USER_TIERS.map(tier => {
              const isCurrent = currentCol === tier
              return (
                <th
                  key={tier}
                  style={{
                    padding: headPad, textAlign: 'center', minWidth: compact ? 56 : 80,
                    background: isCurrent ? 'var(--arvo-chip-bg)' : 'transparent',
                    borderTopLeftRadius: isCurrent ? 10 : 0, borderTopRightRadius: isCurrent ? 10 : 0,
                  }}
                >
                  <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: compact ? 13 : 15, fontWeight: 700, color: 'var(--arvo-fg)' }}>
                    {tierLabel(tier, s)}
                  </div>
                  {isCurrent && (
                    <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: compact ? 9 : 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-gold-text)', marginTop: 2 }}>
                      {s.yourPlan ?? 'seu plano'}
                    </div>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(rowKey => {
            const isHighlight = rowKey === highlightRow
            const rowLabel = rows[rowKey] ?? rowKey
            return (
              <tr key={rowKey}>
                <td
                  style={{
                    padding: cellPad, fontFamily: 'var(--arvo-font-body)', fontSize: labelFont,
                    color: isHighlight ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)', position: 'sticky', left: 0,
                    background: isHighlight ? 'var(--arvo-gold-tint, rgba(200,184,154,0.14))' : 'var(--arvo-surface)',
                    borderTop: '1px solid var(--arvo-border-soft)',
                    borderLeft: isHighlight ? '2px solid var(--arvo-gold-text)' : '2px solid transparent',
                    fontWeight: isHighlight ? 600 : 400,
                  }}
                >
                  {rowLabel}
                </td>
                {USER_TIERS.map(tier => {
                  const { text, on } = cellContent(rowKey, tier, entitlements, labels)
                  const isCurrentCol = currentCol === tier
                  return (
                    <td
                      key={tier}
                      style={{
                        padding: cellPad, textAlign: 'center', fontFamily: 'var(--arvo-font-body)',
                        fontSize: cellFont, fontWeight: on ? 600 : 400,
                        color: on ? 'var(--arvo-fg)' : 'var(--arvo-fg-faint)',
                        borderTop: '1px solid var(--arvo-border-soft)',
                        background: isHighlight
                          ? 'var(--arvo-gold-tint, rgba(200,184,154,0.14))'
                          : isCurrentCol ? 'var(--arvo-chip-bg)' : 'transparent',
                      }}
                    >
                      {text}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
