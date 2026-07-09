import { useI18n } from '../contexts/I18nContext'
import { useUpgrade } from '../contexts/UpgradeContext'
import { PageLoader } from '../components/ArvoLoader'
import TierComparisonTable from '../components/upgrade/TierComparisonTable'
import UpgradeArt from '../components/upgrade/UpgradeArt'
import UpgradeCta from '../components/upgrade/UpgradeCta'
import { tierLabel, type GateTier } from '../components/upgrade/tierMeta'

// Página inteira /planos: mesma tabela do modal (mesmo componente), o plano
// atual destacado e o CTA de avisar. Sem preços. Ver docs/TIERS_PLAN.md.
export default function PlansPage() {
  const { t } = useI18n()
  const s = ((t as any).upgrade ?? {}) as Record<string, any>
  const { entitlements, loading } = useUpgrade()

  if (loading && !entitlements) return <PageLoader />

  const currentTier = entitlements?.tier ?? 'free'
  const currentLabel = (['free', 'plus', 'pro'] as GateTier[]).includes(currentTier as GateTier)
    ? tierLabel(currentTier as GateTier, s)
    : (s.tierBeta ?? 'Beta')

  return (
    <div className="space-y-6" style={{ maxWidth: 720, margin: '0 auto' }}>
      <UpgradeArt height={148} />

      <div>
        <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--arvo-gold-text)', marginBottom: 6 }}>
          {s.plansEyebrow ?? 'Planos'}
        </div>
        <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 28, lineHeight: 1.15, color: 'var(--arvo-fg)' }}>
          {s.plansTitle ?? 'O Arvo por dentro'}
        </h1>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 15, lineHeight: 1.6, color: 'var(--arvo-fg-muted)', marginTop: 10, maxWidth: 560 }}>
          {s.plansIntro ?? 'Todo mundo aqui já faz parte da comunidade. Os planos abrem o que dá pra automatizar e analisar — e ainda não estão à venda.'}
        </p>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg-soft)', marginTop: 8 }}>
          {(s.plansCurrent ?? 'Seu plano atual: {tier}').replace('{tier}', currentLabel)}
        </p>
      </div>

      {entitlements && (
        <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, padding: '10px 14px', boxShadow: 'var(--arvo-shadow-sm)' }}>
          <TierComparisonTable entitlements={entitlements} />
        </div>
      )}

      <div style={{ maxWidth: 420, margin: '0 auto', width: '100%' }}>
        {/* Na página inteira o "gate" do interesse é genérico: usamos 'plans'. */}
        <UpgradeCta gate="plans" showPlansLink={false} />
      </div>
    </div>
  )
}
