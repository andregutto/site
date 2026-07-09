import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../contexts/I18nContext'
import { useUpgrade } from '../../contexts/UpgradeContext'

// CTA "Avisar quando abrir" + subcopy + link secundário "Ver todos os planos".
// Usado no modal (fundo dark) e nos cards da /planos (superfície clara). O gate
// registrado fica marcado no UpgradeContext (persiste enquanto a sessão viver),
// então o botão vira estado de sucesso desabilitado se o usuário já clicou.
//
// `dark`: no modal e no painel bloqueado o CTA vive sobre #0D0D0D — o botão fica
// dourado com texto preto (mesma regra dos botões primários em dark do design
// system) e a subcopy usa tons claros. Fora disso (cards claros) é o inverso.
export default function UpgradeCta({
  gate,
  showPlansLink = true,
  showSubcopy = true,
  dark = false,
  onNavigate,
}: { gate: string; showPlansLink?: boolean; showSubcopy?: boolean; dark?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n()
  const s = ((t as any).upgrade ?? {}) as Record<string, string>
  const { registerInterest, interestedGates } = useUpgrade()
  const [busy, setBusy] = useState(false)
  const done = interestedGates.has(gate)

  async function notify() {
    if (done || busy) return
    setBusy(true)
    await registerInterest(gate)
    setBusy(false)
  }

  const btnBg = done
    ? (dark ? 'rgba(242,237,228,0.10)' : 'var(--arvo-chip-bg)')
    : (dark ? 'var(--arvo-gold)' : 'var(--arvo-black)')
  const btnFg = done
    ? (dark ? 'var(--arvo-gold)' : 'var(--arvo-gold-text)')
    : (dark ? 'var(--arvo-black)' : 'var(--arvo-offwhite)')

  return (
    <div>
      <button
        onClick={notify}
        disabled={done || busy}
        style={{
          width: '100%', padding: '13px 20px', borderRadius: 12, border: 'none',
          fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase', cursor: done ? 'default' : 'pointer',
          background: btnBg, color: btnFg,
          opacity: busy ? 0.6 : 1, transition: 'opacity 160ms',
        }}
      >
        {done ? (s.notifiedDone ?? 'Você será avisado ✓') : busy ? (s.notifying ?? '...') : (s.notifyCta ?? 'Avisar quando abrir')}
      </button>
      {showSubcopy && (
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, lineHeight: 1.55, color: dark ? 'rgba(242,237,228,0.6)' : 'var(--arvo-fg-soft)', textAlign: 'center', marginTop: 11 }}>
          {s.notifySubcopy ?? 'Os upgrades ainda não estão à venda. Quem registra interesse fica sabendo primeiro quando abrirem.'}
        </p>
      )}
      {showPlansLink && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Link
            to="/planos"
            onClick={onNavigate}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: dark ? 'rgba(242,237,228,0.72)' : 'var(--arvo-fg-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            {s.seeAllPlans ?? 'Ver todos os planos'}
          </Link>
        </div>
      )}
    </div>
  )
}
