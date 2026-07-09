import { useI18n } from '../../contexts/I18nContext'
import { Link } from 'react-router-dom'
import { useTheme } from '../../contexts/ThemeContext'
import { useUpgrade, type GateTier } from '../../contexts/UpgradeContext'
import UpgradeArt from './UpgradeArt'
import { TierGlyph } from './TierBadge'

// Painel bloqueado premium mostrado NO LUGAR da página gated (o children nunca
// monta — a página real nunca fica utilizável por trás). Segue o tema do app:
// no dark, superfície escura com a foto autoral cobrindo o card e texto claro.
// No light, superfície CLARA do tema (--arvo-surface) com a foto reduzida a uma
// faixa de topo CONTIDA — foto é elemento, não tema. O glifo arvo NA COR do tier
// fica INTEIRO (chip com fundo sólido, sobreposto à faixa mas nunca cortado),
// e dois botões alinhados. Fechar o modal mantém este painel.
// Ver docs/TIERS_PLAN.md.
export default function GatedEmptyState({ gate, requiredTier = 'plus' }: { gate: string; requiredTier?: GateTier }) {
  const { t } = useI18n()
  const { resolvedTheme } = useTheme()
  const onDark = resolvedTheme === 'dark'
  const s = ((t as any).upgrade ?? {}) as Record<string, any>
  const { registerInterest, interestedGates } = useUpgrade()

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

  const glyphChipBg = onDark ? 'rgba(200,184,154,0.1)' : 'var(--arvo-gold-tint)'
  const glyphChipBorder = onDark ? 'rgba(200,184,154,0.24)' : 'var(--arvo-gold-line)'

  return (
    // Wrapper com o fundo NORMAL do app (nunca transparente) — o card claro
    // fica assentado sobre a superfície do tema, não sobre o vazio.
    // paddingBottom generoso: no mobile o nav flutuante inferior cobre ~90px
    // e atropelava o último botão do card.
    <div style={{ background: 'var(--arvo-bg)', borderRadius: 22, padding: '8px 0 110px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <div
          style={{
            position: 'relative', borderRadius: 22, overflow: 'hidden',
            background: onDark ? '#0D0D0D' : 'var(--arvo-surface)',
            border: onDark ? '1px solid rgba(200,184,154,0.14)' : '1px solid var(--arvo-border)',
            boxShadow: onDark ? '0 24px 60px -28px rgba(0,0,0,0.5)' : 'var(--arvo-shadow-lg)',
          }}
        >
          {/* Foto autoral: cobre o card no dark (visual aprovado); no light é uma
              faixa de topo CONTIDA (altura fixa), e o corpo abaixo é a superfície
              clara do tema. */}
          <UpgradeArt
            tier={requiredTier}
            eyebrow={eyebrow}
            showWordmark={false}
            photoOpacity={onDark ? 0.5 : 0.92}
            style={onDark ? { position: 'absolute', inset: 0 } : { height: 132 }}
          />
          <div
            style={{
              position: 'relative',
              // No light: padding-top reserva o espaço pro glifo que sobe (‑34)
              // sobre a faixa da foto sem ser cortado (o container não corta:
              // overflow visible aqui, o corte do card é só nas bordas externas).
              padding: onDark ? '64px 40px' : '0 40px 44px',
              textAlign: 'center', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 18,
            }}
          >
            {/* Glifo arvo na cor do tier requerido, INTEIRO. No light sobe sobre
                a faixa da foto (margin negativa) com fundo sólido do chip pra
                amarrar as duas regiões sem cortar o desenho. */}
            <div
              style={{
                marginTop: onDark ? 0 : -34, width: 68, height: 68, borderRadius: 20,
                background: onDark ? glyphChipBg : 'var(--arvo-surface)',
                border: `1px solid ${glyphChipBorder}`,
                boxShadow: onDark ? 'none' : 'var(--arvo-shadow-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', zIndex: 1,
              }}
            >
              <TierGlyph tier={requiredTier} size={34} onDark={onDark} />
            </div>

            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 26, color: onDark ? 'var(--arvo-fg-on-dark)' : 'var(--arvo-fg)', maxWidth: 460, lineHeight: 1.25 }}>
              {title}
            </h1>
            <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 17, color: onDark ? 'var(--arvo-gold)' : 'var(--arvo-gold-text)', maxWidth: 440, lineHeight: 1.65 }}>
              {s.gatedPageBody ?? 'Isso abre com o upgrade. Você segue na comunidade normalmente enquanto isso.'}
            </p>

            <div className="flex flex-col sm:flex-row" style={{ gap: 12, marginTop: 8, width: '100%', maxWidth: 380 }}>
              <Link
                to="/planos"
                style={{ ...btnBase, background: 'var(--arvo-gold)', color: 'var(--arvo-black)' }}
              >
                {s.seePlans ?? 'Ver planos'}
              </Link>
              {/* Registra o interesse direto (decisão 2026-07-09) — abrir o modal
                  aqui era redundante: a página de bloqueio JÁ é o contexto. */}
              <button
                onClick={() => registerInterest(gate)}
                disabled={interestedGates.has(gate)}
                style={{ ...btnBase,
                  background: onDark ? 'rgba(242,237,228,0.08)' : 'var(--arvo-chip-bg)',
                  color: onDark ? 'rgba(242,237,228,0.9)' : 'var(--arvo-fg)',
                  border: onDark ? '1px solid rgba(200,184,154,0.2)' : '1px solid var(--arvo-border)',
                  opacity: interestedGates.has(gate) ? 0.75 : 1,
                  cursor: interestedGates.has(gate) ? 'default' : 'pointer',
                }}
              >
                {interestedGates.has(gate) ? (s.notifyDone ?? 'Você será avisado ✓') : (s.notifyCta ?? 'Avisar quando abrir')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
