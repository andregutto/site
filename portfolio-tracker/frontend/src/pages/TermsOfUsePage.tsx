import { Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import LoginFooter from '../components/LoginFooter'
import LanguageSelector from '../components/LanguageSelector'

export default function TermsOfUsePage() {
  const { t } = useI18n()
  const tp = t.termsPage

  const sections = [
    { title: tp.s1title, body: tp.s1body },
    { title: tp.s2title, body: tp.s2body },
    { title: tp.s3title, body: tp.s3body },
    { title: tp.s4title, body: tp.s4body },
    { title: tp.s5title, body: tp.s5body },
    { title: tp.s6title, body: tp.s6body },
    { title: tp.s7title, body: tp.s7body },
    { title: tp.s8title, body: tp.s8body },
    { title: tp.s9title, body: tp.s9body },
  ]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px', background: 'var(--arvo-offwhite)' }}>
      <div style={{ width: '100%', maxWidth: 672, display: 'flex', flexDirection: 'column', gap: 24 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
            <img src="/brand/logo/arvo-symbol-black.svg" width="16" height="16" alt="" style={{ opacity: 0.55 }} />
            <span style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 11, letterSpacing: '0.20em', color: 'var(--arvo-fg-soft)' }}>arvo</span>
          </Link>
          <LanguageSelector />
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '36px 36px', border: '1px solid var(--arvo-border)', boxShadow: '0 1px 4px rgba(13,13,13,0.05)' }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 28, letterSpacing: '0.06em', color: 'var(--arvo-black)', marginBottom: 8 }}>{tp.title}</h1>
            <p style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 11, letterSpacing: '0.10em', color: 'var(--arvo-fg-soft)' }}>{tp.updated}</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {sections.map(({ title, body }) => (
              <div key={title}>
                <h2 style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 13, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--arvo-fg)', marginBottom: 6 }}>{title}</h2>
                <p style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 14, color: 'var(--arvo-fg-muted)', lineHeight: 1.80 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>

        <LoginFooter />
      </div>
    </div>
  )
}
