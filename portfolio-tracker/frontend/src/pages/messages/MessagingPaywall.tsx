import { useI18n } from '../../contexts/I18nContext'

const GOLD = '#C8B89A'

export default function MessagingPaywall() {
  const { t } = useI18n()
  const tm = (t as any).messages ?? {}

  return (
    <div className="flex flex-col items-center justify-center text-center gap-4" style={{ padding: '64px 24px' }}>
      <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 28, color: GOLD }}>◑</span>
      <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 22, color: 'var(--arvo-fg)', letterSpacing: '0.02em' }}>
        {tm.premiumTitle ?? 'Mensagens é um recurso premium'}
      </h1>
      <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--arvo-fg-soft)', maxWidth: 420, lineHeight: 1.6 }}>
        {tm.premiumSubtitle ?? 'Converse em tempo real com seus amigos no Arvo. Disponível no plano pago.'}
      </p>
      <a
        href="/profile"
        style={{
          fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
          padding: '11px 22px', borderRadius: 10, background: GOLD, color: '#1a1200', textDecoration: 'none', marginTop: 8,
        }}
      >
        {tm.premiumCta ?? 'Conhecer o plano premium'}
      </a>
    </div>
  )
}
