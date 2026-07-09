import { useI18n } from '../../contexts/I18nContext'
import { Link } from 'react-router-dom'
import { useUpgrade, type GateTier } from '../../contexts/UpgradeContext'
import UpgradeArt from './UpgradeArt'
import { TierGlyph } from './TierBadge'

// Painel bloqueado premium mostrado NO LUGAR da página gated (o children nunca
// monta — a página real nunca fica utilizável por trás). Superfície dark com a
// foto autoral do tier requerido, o glifo arvo NA COR do tier acima do título,
// e dois botões alinhados. Fechar o modal mantém este painel. Ver
// docs/TIERS_PLAN.md.
export default function GatedEmptyState({ gate, requiredTier = 'plus' }: { gate: string; requiredTier?: GateTier }) {
  const { t } = useI18n()
  const s = ((t as any).upgrade ?? {}) as Record<string, any>
  const { openUpgrade } = useUpgrade()

  const title = s.titles?.[gate] ?? (s.lockedTitle ?? 'Uma parte do Arvo que ainda não é sua')
  const eyebrow = requiredTier === 'pro' ? (s.tierEyebrowPro ?? 'Arvo Pro') : (s.tierEyebrowPlus ?? 'Arvo Plus')

  // Botões partilham este layout: flex + center pra o texto ficar verticalmente
  // centrado (o bug do dono era texto desalinhado no botão).
  const btnBase: React.CSSProperties = {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minHeight: 46, boxSizing: 'border-box',
    fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, fontWeight: 600,
    letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1,
    padding: '0 20px', borderRadius: 12, textDecoration: 'none', cursor: 'pointer',
  }

  return (
    <div style={{ maxWidth: 620, margin: '8px auto' }}>
      <div
        style={{
          position: 'relative', borderRadius: 22, overflow: 'hidden',
          background: '#0D0D0D', border: '1px solid rgba(200,184,154,0.14)',
          boxShadow: '0 24px 60px -28px rgba(0,0,0,0.5)',
        }}
      >
        <UpgradeArt tier={requiredTier} eyebrow={eyebrow} showWordmark={false} photoOpacity={0.42} style={{ position: 'absolute', inset: 0 }} />
        <div style={{ position: 'relative', padding: '64px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          {/* Glifo arvo grande na cor do tier requerido. */}
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(200,184,154,0.1)', border: '1px solid rgba(200,184,154,0.24)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TierGlyph tier={requiredTier} size={34} glow glowRadius={8} />
          </div>

          <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 26, color: 'var(--arvo-fg-on-dark)', maxWidth: 460, lineHeight: 1.25 }}>
            {title}
          </h1>
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 15.5, color: 'var(--arvo-gold)', maxWidth: 440, lineHeight: 1.6 }}>
            {s.gatedPageBody ?? 'Isso abre com o upgrade. Você segue na comunidade normalmente enquanto isso.'}
          </p>

          <div className="flex flex-col sm:flex-row" style={{ gap: 12, marginTop: 8, width: '100%', maxWidth: 380 }}>
            <Link
              to="/planos"
              style={{ ...btnBase, background: 'var(--arvo-gold)', color: 'var(--arvo-black)' }}
            >
              {s.seePlans ?? 'Ver planos'}
            </Link>
            <button
              onClick={() => openUpgrade(gate, requiredTier)}
              style={{ ...btnBase, background: 'rgba(242,237,228,0.08)', color: 'rgba(242,237,228,0.9)', border: '1px solid rgba(200,184,154,0.2)' }}
            >
              {s.notifyCta ?? 'Avisar quando abrir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
