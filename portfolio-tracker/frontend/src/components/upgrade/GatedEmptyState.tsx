import { useI18n } from '../../contexts/I18nContext'
import { Link } from 'react-router-dom'
import { useUpgrade, type GateTier } from '../../contexts/UpgradeContext'
import UpgradeArt from './UpgradeArt'

// Painel bloqueado premium mostrado NO LUGAR da página gated (o children nunca
// monta — a página real nunca fica utilizável por trás). Superfície dark com
// cadeado/composição, título curto e dois botões: "Ver planos" e "Avisar quando
// abrir". Fechar o modal mantém este painel. Ver docs/TIERS_PLAN.md.
export default function GatedEmptyState({ gate, requiredTier = 'plus' }: { gate: string; requiredTier?: GateTier }) {
  const { t } = useI18n()
  const s = ((t as any).upgrade ?? {}) as Record<string, any>
  const { openUpgrade } = useUpgrade()

  const title = s.titles?.[gate] ?? (s.lockedTitle ?? 'Uma parte do Arvo que ainda não é sua')
  const eyebrow = requiredTier === 'pro' ? (s.tierEyebrowPro ?? 'Arvo Pro') : (s.tierEyebrowPlus ?? 'Arvo Plus')

  return (
    <div style={{ maxWidth: 560, margin: '8px auto' }}>
      <div
        style={{
          position: 'relative', borderRadius: 20, overflow: 'hidden',
          background: '#0D0D0D', border: '1px solid rgba(200,184,154,0.14)',
          boxShadow: '0 24px 60px -28px rgba(0,0,0,0.5)',
        }}
      >
        <UpgradeArt eyebrow={eyebrow} showWordmark={false} style={{ position: 'absolute', inset: 0 }} />
        <div style={{ position: 'relative', padding: '52px 28px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {/* Cadeado */}
          <div style={{ width: 52, height: 52, borderRadius: 999, background: 'rgba(200,184,154,0.12)', border: '1px solid rgba(200,184,154,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--arvo-gold)" strokeWidth={1.6}>
              <rect x="5" y="11" width="14" height="9" rx="2" strokeLinejoin="round" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
            </svg>
          </div>

          <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 24, color: 'var(--arvo-fg-on-dark)', maxWidth: 420, lineHeight: 1.25 }}>
            {title}
          </h1>
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--arvo-gold)', maxWidth: 400, lineHeight: 1.6 }}>
            {s.gatedPageBody ?? 'Isso abre com o upgrade. Você segue na comunidade normalmente enquanto isso.'}
          </p>

          <div className="flex flex-col sm:flex-row" style={{ gap: 12, marginTop: 6, width: '100%', maxWidth: 340 }}>
            <Link
              to="/planos"
              style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '12px 20px', borderRadius: 12, background: 'var(--arvo-gold)', color: 'var(--arvo-black)', textDecoration: 'none' }}
            >
              {s.seePlans ?? 'Ver planos'}
            </Link>
            <button
              onClick={() => openUpgrade(gate, requiredTier)}
              style={{ flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '12px 20px', borderRadius: 12, background: 'rgba(242,237,228,0.08)', color: 'rgba(242,237,228,0.9)', border: '1px solid rgba(200,184,154,0.2)', cursor: 'pointer' }}
            >
              {s.notifyCta ?? 'Avisar quando abrir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
