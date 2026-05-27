import { Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import LoginFooter from '../components/LoginFooter'
import LanguageSelector from '../components/LanguageSelector'

export default function PrivacyPolicyPage() {
  const { t } = useI18n()
  const p = t.privacy

  const sections = [
    { title: p.s1title, body: p.s1body },
    { title: p.s2title, body: p.s2body },
    { title: p.s3title, body: p.s3body },
    { title: p.s4title, body: p.s4body },
    { title: p.s5title, body: p.s5body },
    { title: p.s6title, body: p.s6body },
    { title: p.s7title, body: p.s7body },
    { title: p.s8title, body: p.s8body },
    { title: p.s9title, body: p.s9body },
  ]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'calc(40px + env(safe-area-inset-top, 0px)) 16px 40px', background: 'var(--arvo-offwhite)' }}>
      <div style={{ width: '100%', maxWidth: 672, display: 'flex', flexDirection: 'column', gap: 24 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
            <img src="/brand/logo/arvo-symbol-black.svg" width="16" height="16" alt="" style={{ opacity: 0.55 }} />
            <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 11, letterSpacing: '0.20em', color: 'var(--arvo-fg-soft)' }}>arvo</span>
          </Link>
          <LanguageSelector />
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '36px 36px', border: '1px solid var(--arvo-border)', boxShadow: '0 1px 4px rgba(13,13,13,0.05)' }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 28, letterSpacing: '0.06em', color: 'var(--arvo-black)', marginBottom: 8 }}>{p.title}</h1>
            <p style={{ fontFamily: "var(--arvo-font-body)", fontSize: 11, letterSpacing: '0.10em', color: 'var(--arvo-fg-soft)' }}>{p.updated}</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {sections.map(({ title, body }) => (
              <div key={title}>
                <h2 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 13, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--arvo-fg)', marginBottom: 6 }}>{title}</h2>
                <p style={{ fontFamily: "var(--arvo-font-body)", fontSize: 14, color: 'var(--arvo-fg-muted)', lineHeight: 1.80 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>

        <LoginFooter />
      </div>
    </div>
  )
}
