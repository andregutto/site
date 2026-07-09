import { useI18n } from '../../contexts/I18nContext'
import { useTheme } from '../../contexts/ThemeContext'
import type { GateTier, UpgradeExtra } from '../../contexts/UpgradeContext'
import { curatedBenefits, AI_BENEFIT_KEYS } from './tierMeta'
import UpgradeArt from './UpgradeArt'
import UpgradeCta from './UpgradeCta'
import TierBadge from './TierBadge'
import { Icon } from '../icons'

// Peça central do sistema de tiers. O CORPO do modal segue o tema do app
// (superfície clara no light, escura no dark). A coluna lateral (UpgradeArt)
// tem foto autoral tratada dark com texto claro dentro dela — foto é elemento,
// não tema, e mantém a composição premium nos dois modos. Sem scroll interno,
// cabe no viewport. Estilo Epic: benefícios de UM tier, arte integrada como
// composição do próprio modal, nada de tabela comparativa completa aqui (isso
// vive na /planos). Bottom-sheet no mobile / card horizontal generoso no desktop.

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
  const tier = requiredTier === 'pro' ? (s.tierPro ?? 'Pro') : (s.tierPlus ?? 'Plus')
  return (s.titleTemplate ?? '{feature} faz parte do Arvo {tier}')
    .replace('{feature}', feature).replace('{tier}', tier)
}

export default function UpgradeModal({ gate, requiredTier, extra, onClose }: Props) {
  const { t } = useI18n()
  const { resolvedTheme } = useTheme()
  const onDark = resolvedTheme === 'dark'
  const s = ((t as any).upgrade ?? {}) as Record<string, any>
  const rows = ((t as any).upgrade?.rows ?? {}) as Record<string, string>

  const title = buildTitle(gate, requiredTier, s, rows)
  const eyebrow = requiredTier === 'pro' ? (s.tierEyebrowPro ?? 'Arvo Pro') : (s.tierEyebrowPlus ?? 'Arvo Plus')
  const benefits = curatedBenefits(requiredTier, gate, s)

  // Se veio de uma quota estourada, mostra "Você usou 5 de 5 ... hoje".
  const quotaLine = (extra?.limit != null && extra?.used != null)
    ? (s.quotaUsed ?? 'Você usou {used} de {limit} nesta funcionalidade.')
        .replace('{used}', String(extra.used)).replace('{limit}', String(extra.limit))
    : null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.62)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-[800px] rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{
          background: onDark ? '#0D0D0D' : 'var(--arvo-surface)',
          maxHeight: '100dvh',
          boxShadow: onDark ? '0 30px 80px -20px rgba(0,0,0,0.7)' : 'var(--arvo-shadow-lg)',
          // No dark uma borda fina dourada dá o recorte; no light a sombra do
          // tema já separa — nada de linha branca por cima (feio, feedback dono).
          border: onDark ? '1px solid rgba(200,184,154,0.14)' : 'none',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col sm:flex-row">
          {/* ── Composição visual: faixa fina no topo (mobile) / coluna lateral
              (desktop). Foto autoral do tier requerido como fundo, com badge do
              tier no eyebrow. É o próprio fundo do modal, não um banner solto. ── */}
          <UpgradeArt
            tier={requiredTier}
            className="shrink-0 sm:w-[300px]"
            style={{ minHeight: 118 }}
          />

          {/* ── Conteúdo ── */}
          <div
            className="flex-1"
            style={{ padding: '20px 22px calc(22px + env(safe-area-inset-bottom, 0px))', position: 'relative' }}
          >
            <button
              onClick={onClose}
              aria-label={s.close ?? 'Fechar'}
              style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: 999, border: 'none', background: onDark ? 'rgba(242,237,228,0.08)' : 'var(--arvo-chip-bg)', color: onDark ? 'rgba(242,237,228,0.7)' : 'var(--arvo-fg-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            >×</button>

            <div style={{ marginBottom: 12 }}>
              <TierBadge tier={requiredTier} label={eyebrow} onDark={onDark} />
            </div>

            <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 23, lineHeight: 1.2, color: onDark ? 'var(--arvo-fg-on-dark)' : 'var(--arvo-fg)', maxWidth: 320, marginTop: 2 }}>
              {title}
            </h2>

            {quotaLine ? (
              <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14, color: onDark ? 'var(--arvo-gold)' : 'var(--arvo-gold-text)', marginTop: 8, lineHeight: 1.5 }}>
                {quotaLine}
              </p>
            ) : (
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: onDark ? 'rgba(242,237,228,0.6)' : 'var(--arvo-fg-muted)', marginTop: 8 }}>
                {s.modalIntro ?? 'Veja o que passa a fazer parte do seu Arvo:'}
              </p>
            )}

            <ul style={{ listStyle: 'none', margin: '14px 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {benefits.map((b, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, lineHeight: 1.4, color: onDark ? 'rgba(242,237,228,0.86)' : 'var(--arvo-fg)' }}>
                  <span style={{ color: onDark ? 'var(--arvo-gold)' : 'var(--arvo-gold-text)', flexShrink: 0, display: 'inline-flex', transform: 'translateY(2px)' }}>
                    {AI_BENEFIT_KEYS.has(b.key)
                      ? <Icon name="sparkle" size={14} />
                      : <span style={{ fontSize: 12 }}>✦</span>}
                  </span>
                  <span>{b.text}</span>
                </li>
              ))}
            </ul>

            <UpgradeCta gate={gate} dark={onDark} onNavigate={onClose} />
          </div>
        </div>
      </div>
    </div>
  )
}
