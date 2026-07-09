import { useI18n } from '../../contexts/I18nContext'
import { useUpgrade, type GateTier, type UpgradeExtra } from '../../contexts/UpgradeContext'
import { tierLabel } from './tierMeta'
import TierComparisonTable from './TierComparisonTable'
import UpgradeArt from './UpgradeArt'
import UpgradeCta from './UpgradeCta'

// Peça central do sistema de tiers. Bottom-sheet no mobile / card centrado no
// desktop (template canônico em CLAUDE.md → Mobile UI conventions). Estilo
// Finary: arte no topo, título dinâmico pelo gate disparador, tabela comparativa
// Free/Plus/Pro e CTA "avisar quando abrir". Sem preços, sem "assine".

interface Props {
  gate: string
  requiredTier: GateTier
  extra?: UpgradeExtra
  onClose: () => void
}

// Título dinâmico: "Patrimônio faz parte do Arvo Plus". Copy por gate em
// upgrade.titles.<gate>; fallback usa o label da linha + template genérico.
function buildTitle(gate: string, requiredTier: GateTier, s: Record<string, any>, rows: Record<string, string>): string {
  const perGate = s.titles?.[gate]
  if (perGate) return perGate
  const feature = rows[gate] ?? gate
  const tier = tierLabel(requiredTier, s)
  return (s.titleTemplate ?? '{feature} faz parte do Arvo {tier}')
    .replace('{feature}', feature).replace('{tier}', tier)
}

export default function UpgradeModal({ gate, requiredTier, extra, onClose }: Props) {
  const { t } = useI18n()
  const s = ((t as any).upgrade ?? {}) as Record<string, any>
  const rows = ((t as any).upgrade?.rows ?? {}) as Record<string, string>
  const { entitlements } = useUpgrade()

  const title = buildTitle(gate, requiredTier, s, rows)

  // Se veio de uma quota estourada, mostra "Você usou 5 de 5 ... hoje".
  const quotaLine = (extra?.limit != null && extra?.used != null)
    ? (s.quotaUsed ?? 'Você usou {used} de {limit} nesta funcionalidade.')
        .replace('{used}', String(extra.used)).replace('{limit}', String(extra.limit))
    : null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[94vh] sm:max-h-[92vh] overflow-y-auto"
        style={{ background: 'var(--arvo-surface)', boxShadow: 'var(--arvo-shadow-lg)', padding: '18px 20px calc(20px + env(safe-area-inset-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Botão fechar */}
        <div className="flex justify-end" style={{ marginBottom: 6 }}>
          <button
            onClick={onClose}
            aria-label={(t as any).common?.close ?? 'Fechar'}
            style={{ width: 30, height: 30, borderRadius: 999, border: 'none', background: 'var(--arvo-chip-bg)', color: 'var(--arvo-fg-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          >×</button>
        </div>

        <UpgradeArt />

        <div style={{ marginTop: 16, marginBottom: 4 }}>
          <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--arvo-gold-text)', marginBottom: 6 }}>
            {s.eyebrow ?? 'Upgrade'}
          </div>
          <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 22, lineHeight: 1.2, color: 'var(--arvo-fg)' }}>
            {title}
          </h2>
          {quotaLine && (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg-muted)', marginTop: 8 }}>
              {quotaLine}
            </p>
          )}
        </div>

        {entitlements && (
          <div style={{ marginTop: 16, marginBottom: 20 }}>
            <TierComparisonTable entitlements={entitlements} highlightRow={gate} compact />
          </div>
        )}

        <UpgradeCta gate={gate} />
      </div>
    </div>
  )
}
