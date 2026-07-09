import { useI18n } from '../../contexts/I18nContext'
import { useUpgrade, type GateTier } from '../../contexts/UpgradeContext'

// Estado vazio elegante mostrado quando uma página/seção inteira caiu num 403
// upgrade_required. O modal já foi aberto pela interceptação; aqui garantimos
// que o fundo não é UI quebrada nem spinner infinito, e damos um botão pra
// reabrir o modal caso o usuário o feche.
export default function GatedEmptyState({ gate, requiredTier = 'plus' }: { gate: string; requiredTier?: GateTier }) {
  const { t } = useI18n()
  const s = ((t as any).upgrade ?? {}) as Record<string, any>
  const rows = ((t as any).upgrade?.rows ?? {}) as Record<string, string>
  const { openUpgrade } = useUpgrade()

  const feature = rows[gate] ?? gate
  const tier = requiredTier === 'pro' ? (s.tierPro ?? 'Pro') : (s.tierPlus ?? 'Plus')
  const title = s.titles?.[gate]
    ?? (s.titleTemplate ?? '{feature} faz parte do Arvo {tier}').replace('{feature}', feature).replace('{tier}', tier)

  return (
    <div
      className="flex flex-col items-center justify-center gap-4"
      style={{ padding: '72px 24px', textAlign: 'center', minHeight: '50vh' }}
    >
      <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 26, color: 'var(--arvo-gold-text)' }}>◑</span>
      <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 22, color: 'var(--arvo-fg)', maxWidth: 420, lineHeight: 1.25 }}>
        {title}
      </h1>
      <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--arvo-fg-soft)', maxWidth: 420, lineHeight: 1.6 }}>
        {s.gatedPageBody ?? 'Isso abre com o upgrade. Você segue na comunidade normalmente enquanto isso.'}
      </p>
      <button
        onClick={() => openUpgrade(gate, requiredTier)}
        style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '12px 24px', borderRadius: 10, background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', border: 'none', cursor: 'pointer', marginTop: 4 }}
      >
        {s.gatedPageCta ?? 'Ver o que muda'}
      </button>
    </div>
  )
}
