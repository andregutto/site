import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../contexts/I18nContext'
import { useUpgrade } from '../../contexts/UpgradeContext'

// CTA "Avisar quando abrir" + subcopy + link secundário "Ver todos os planos".
// Compartilhado entre o modal e a página /planos. O gate registrado fica marcado
// no UpgradeContext (persiste enquanto a sessão viver), então o botão vira estado
// de sucesso desabilitado se o usuário já clicou naquele gate.
export default function UpgradeCta({ gate, showPlansLink = true }: { gate: string; showPlansLink?: boolean }) {
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

  return (
    <div>
      <button
        onClick={notify}
        disabled={done || busy}
        style={{
          width: '100%', padding: '13px 20px', borderRadius: 12, border: 'none',
          fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, letterSpacing: '0.06em',
          textTransform: 'uppercase', cursor: done ? 'default' : 'pointer',
          background: done ? 'var(--arvo-chip-bg)' : 'var(--arvo-black)',
          color: done ? 'var(--arvo-gold-text)' : 'var(--arvo-offwhite)',
          opacity: busy ? 0.6 : 1, transition: 'opacity 160ms',
        }}
      >
        {done ? (s.notifiedDone ?? 'Você será avisado ✓') : busy ? (s.notifying ?? '...') : (s.notifyCta ?? 'Avisar quando abrir')}
      </button>
      <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--arvo-fg-soft)', textAlign: 'center', marginTop: 12 }}>
        {s.notifySubcopy ?? 'Os upgrades ainda não estão à venda. Quem registra interesse fica sabendo primeiro quando abrirem.'}
      </p>
      {showPlansLink && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Link
            to="/planos"
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            {s.seeAllPlans ?? 'Ver todos os planos'}
          </Link>
        </div>
      )}
    </div>
  )
}
