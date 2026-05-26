import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import LanguageSelector from '../components/LanguageSelector'

const DARK  = '#0D0D0D'
const GOLD  = '#C8B89A'
const BG    = '#F2EDE4'
const BORDER = 'rgba(13,13,13,0.09)'
// Text hierarchy on beige/offwhite — NEVER use raw gray-* classes on light bg
const T_PRIMARY   = 'rgba(13,13,13,0.92)'   // headings
const T_BODY      = 'rgba(13,13,13,0.78)'   // body paragraphs
const T_SECONDARY = 'rgba(13,13,13,0.58)'   // labels / eyebrows / metadata

const F_SANS    = "'Tenor Sans', sans-serif"
const F_DISPLAY = "'Playfair Display', serif"

const ICONS = ['◈', '◎', '▦', '◉', '✦', '◑']

export default function LandingPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const l = (t as unknown as Record<string, Record<string, string>>).landing ?? {}

  const FEATURES = [
    { icon: ICONS[0], label: l.f1label, title: l.f1title, desc: l.f1desc },
    { icon: ICONS[1], label: l.f2label, title: l.f2title, desc: l.f2desc },
    { icon: ICONS[2], label: l.f3label, title: l.f3title, desc: l.f3desc },
    { icon: ICONS[3], label: l.f4label, title: l.f4title, desc: l.f4desc },
    { icon: ICONS[4], label: l.f5label, title: l.f5title, desc: l.f5desc },
    { icon: ICONS[5], label: l.f6label, title: l.f6title, desc: l.f6desc },
  ]
  const STEPS = [
    { num: l.s1num, title: l.s1title, desc: l.s1desc },
    { num: l.s2num, title: l.s2title, desc: l.s2desc },
    { num: l.s3num, title: l.s3title, desc: l.s3desc },
  ]
  const FAQS = [
    { q: l.q1, a: l.a1 },
    { q: l.q2, a: l.a2 },
    { q: l.q3, a: l.a3 },
    { q: l.q4, a: l.a4 },
    { q: l.q5, a: l.a5 },
    { q: l.q6, a: l.a6 },
  ]

  const [openFaq,          setOpenFaq]          = useState<number | null>(null)
  const [menuOpen,         setMenuOpen]          = useState(false)
  const [loginOpen,        setLoginOpen]         = useState(false)
  const [loginEmail,       setLoginEmail]        = useState('')
  const [loginPass,        setLoginPass]         = useState('')
  const [loginErr,         setLoginErr]          = useState('')
  const [loginLoading,     setLoginLoading]      = useState(false)
  const [mobileLoginOpen,  setMobileLoginOpen]   = useState(false)

  const loginRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loginOpen) return
    function onDown(e: MouseEvent) {
      if (loginRef.current && !loginRef.current.contains(e.target as Node)) setLoginOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [loginOpen])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginErr('')
    setLoginLoading(true)
    try {
      await signIn(loginEmail, loginPass)
      navigate('/dashboard')
    } catch (err) {
      setLoginErr(err instanceof Error ? err.message : 'Credenciais inválidas')
    } finally {
      setLoginLoading(false)
    }
  }

  return (
    <div style={{ background: BG, color: T_PRIMARY, fontFamily: F_SANS, minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── HEADER ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(242,237,228,0.96)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>

          <a href="#hero" style={{ textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/brand/logo/arvo-symbol-black.svg" width="20" height="20" alt="" />
            <span style={{ fontFamily: F_SANS, fontSize: 15, letterSpacing: '0.30em', textIndent: '0.30em', color: DARK, lineHeight: 1 }}>arvo</span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex" style={{ alignItems: 'center', gap: 36 }}>
            {[[`#funcionalidades`, l.navFeatures],[`#como-funciona`, l.navHow],[`#faq`, l.navFaq]].map(([href, label]) => (
              <a key={href} href={href} style={{ fontFamily: F_SANS, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: T_SECONDARY, textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = DARK)}
                onMouseLeave={e => (e.currentTarget.style.color = T_SECONDARY)}
              >{label}</a>
            ))}
          </nav>

          {/* Desktop right */}
          <div className="hidden md:flex" style={{ alignItems: 'center', gap: 16 }}>
            <LanguageSelector />

            <div ref={loginRef} style={{ position: 'relative' }}>
              <button onClick={() => { setLoginOpen(o => !o); setLoginErr('') }}
                style={{ fontFamily: F_SANS, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: DARK, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {l.enterBtn}
              </button>

              {loginOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 12px)', right: 0, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.10)', padding: '24px 22px', width: 288, zIndex: 10 }}>
                  <p style={{ fontFamily: F_DISPLAY, fontSize: 17, fontWeight: 400, color: DARK, marginBottom: 18 }}>{l.loginTitle}</p>
                  <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <input type="email" required autoFocus placeholder="E-mail" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                      className="arvo-input"
                      style={{ fontFamily: F_SANS, fontSize: 13, padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 4, outline: 'none', color: DARK, background: '#fff', width: '100%', boxSizing: 'border-box' }}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.boxShadow = `0 0 0 2px rgba(200,184,154,0.25)` }}
                      onBlur={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = 'none' }}
                    />
                    <input type="password" required placeholder="Senha" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                      style={{ fontFamily: F_SANS, fontSize: 13, padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 4, outline: 'none', color: DARK, background: '#fff', width: '100%', boxSizing: 'border-box' }}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.boxShadow = `0 0 0 2px rgba(200,184,154,0.25)` }}
                      onBlur={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = 'none' }}
                    />
                    {loginErr && <p style={{ fontFamily: F_SANS, fontSize: 12, color: '#dc2626', margin: 0 }}>{loginErr}</p>}
                    <button type="submit" disabled={loginLoading}
                      style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: DARK, color: '#fff', border: 'none', borderRadius: 4, padding: '11px 0', cursor: 'pointer', opacity: loginLoading ? 0.6 : 1, marginTop: 4 }}>
                      {loginLoading ? '...' : l.enterBtn}
                    </button>
                  </form>
                  <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link to="/login?mode=forgot" onClick={() => setLoginOpen(false)}
                      style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.08em', color: T_SECONDARY, textDecoration: 'none' }}>{l.forgotPwd}</Link>
                    <Link to="/login?mode=register" onClick={() => setLoginOpen(false)}
                      style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.08em', color: DARK, textDecoration: 'none' }}>{l.createAccount}</Link>
                  </div>
                </div>
              )}
            </div>

            <Link to="/login?mode=register"
              style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: DARK, color: '#fff', textDecoration: 'none', padding: '10px 20px', borderRadius: 3 }}>
              {l.createBtn}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden" onClick={() => setMenuOpen(o => !o)} aria-label="Menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: DARK, padding: 8, lineHeight: 0, marginRight: -8 }}>
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />}
            </svg>
          </button>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="md:hidden" style={{ background: 'rgba(242,237,228,0.98)', borderTop: `1px solid ${BORDER}`, padding: '8px 24px 20px' }}>
            {[[`#funcionalidades`, l.navFeatures],[`#como-funciona`, l.navHow],[`#faq`, l.navFaq]].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}
                style={{ display: 'flex', alignItems: 'center', padding: '15px 0', fontFamily: F_SANS, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: T_SECONDARY, textDecoration: 'none', borderBottom: `1px solid ${BORDER}` }}>
                {label}
              </a>
            ))}
            <div style={{ padding: '12px 0', borderBottom: `1px solid ${BORDER}` }}>
              <LanguageSelector />
            </div>
            {!mobileLoginOpen ? (
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button onClick={() => { setMobileLoginOpen(true); setLoginErr('') }}
                  style={{ flex: 1, textAlign: 'center', padding: '13px 0', fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: DARK, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 3, cursor: 'pointer' }}>
                  {l.enterBtn}
                </button>
                <Link to="/login?mode=register" onClick={() => setMenuOpen(false)}
                  style={{ flex: 1, textAlign: 'center', padding: '13px 0', fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: DARK, color: '#fff', textDecoration: 'none', borderRadius: 3 }}>
                  {l.createAccount}
                </Link>
              </div>
            ) : (
              <form onSubmit={async e => { await handleLogin(e); if (!loginErr) setMenuOpen(false) }}
                style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input type="email" required autoFocus placeholder="E-mail" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  style={{ fontFamily: F_SANS, fontSize: 13, padding: '11px 12px', border: `1px solid ${BORDER}`, borderRadius: 4, color: DARK, background: '#fff', boxSizing: 'border-box' as const }} />
                <input type="password" required placeholder="Senha" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                  style={{ fontFamily: F_SANS, fontSize: 13, padding: '11px 12px', border: `1px solid ${BORDER}`, borderRadius: 4, color: DARK, background: '#fff', boxSizing: 'border-box' as const }} />
                {loginErr && <p style={{ fontFamily: F_SANS, fontSize: 12, color: '#dc2626', margin: 0 }}>{loginErr}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setMobileLoginOpen(false)}
                    style={{ flex: 1, padding: '12px 0', fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 3, cursor: 'pointer', color: T_SECONDARY }}>
                    ←
                  </button>
                  <button type="submit" disabled={loginLoading}
                    style={{ flex: 2, padding: '12px 0', fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: DARK, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', opacity: loginLoading ? 0.6 : 1 }}>
                    {loginLoading ? '...' : l.enterBtn}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section id="hero" style={{ position: 'relative', minHeight: '93vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #080f1c 0%, #0D0D0D 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/brand/imagery/01-broto-floresta.jpg')", backgroundSize: 'cover', backgroundPosition: 'center 40%', filter: 'brightness(0.28) sepia(0.30) saturate(1.20)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%', background: 'linear-gradient(to top, rgba(6,12,24,0.97) 0%, transparent 100%)' }} />
        <div className="arvo-grain" />

        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '0 24px 88px', width: '100%' }}>
          <div style={{ marginBottom: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontFamily: F_SANS, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>
              {l.eyebrow}
            </span>
          </div>

          <h1 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(2.6rem, 6vw, 5rem)', fontWeight: 400, lineHeight: 1.06, color: '#fff', marginBottom: 26, letterSpacing: '-0.4px', maxWidth: 820 }}>
            {l.h1line1}<br />
            <em style={{ fontStyle: 'italic', color: `${GOLD}CC` }}>{l.h1line2}</em>
          </h1>

          <p style={{ fontFamily: F_SANS, fontSize: 'clamp(15px, 2vw, 18px)', color: 'rgba(255,255,255,0.72)', lineHeight: 1.75, maxWidth: 560, marginBottom: 40 }}>
            {l.heroPara}
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link to="/login?mode=register"
              style={{ fontFamily: F_SANS, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', background: GOLD, color: DARK, textDecoration: 'none', padding: '16px 34px', borderRadius: 2 }}>
              {l.heroCta}
            </Link>
            <Link to="/login"
              style={{ fontFamily: F_SANS, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.78)', textDecoration: 'none', padding: '16px 34px', borderRadius: 2, border: '1px solid rgba(255,255,255,0.18)' }}>
              {l.heroAlready}
            </Link>
          </div>

          <p style={{ fontFamily: F_SANS, fontSize: 12, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.52)', marginTop: 18 }}>
            {l.assurance}
          </p>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '24px 20px' }}>
          {[
            { value: l.stat1v, label: l.stat1l },
            { value: l.stat2v, label: l.stat2l },
            { value: l.stat3v, label: l.stat3l },
            { value: l.stat4v, label: l.stat4l },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.5rem, 2.8vw, 2rem)', fontWeight: 400, color: DARK, marginBottom: 6 }}>{s.value}</div>
              <div style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: T_SECONDARY, lineHeight: 1.4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FUNCIONALIDADES ── */}
      <section id="funcionalidades" style={{ padding: 'clamp(64px, 8vw, 100px) 24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 56 }}>
          <p style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T_SECONDARY, marginBottom: 16 }}>{l.featEyebrow}</p>
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.9rem, 3.5vw, 2.7rem)', fontWeight: 400, lineHeight: 1.12, color: DARK, letterSpacing: '-0.3px', maxWidth: 560 }}>
            {l.featH2}
          </h2>
        </div>

        <div style={{ display: 'grid', gap: 1, background: BORDER }} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={i} style={{ background: '#fff', padding: 'clamp(28px, 4vw, 40px) clamp(24px, 3vw, 36px)' }}>
              <div style={{ fontFamily: F_SANS, fontSize: 20, color: DARK, marginBottom: 14, lineHeight: 1 }}>{f.icon}</div>
              <p style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T_SECONDARY, marginBottom: 10 }}>{f.label}</p>
              <h3 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1rem, 1.8vw, 1.25rem)', fontWeight: 400, color: DARK, marginBottom: 10, lineHeight: 1.25 }}>{f.title}</h3>
              <p style={{ fontFamily: F_SANS, fontSize: 14, color: T_BODY, lineHeight: 1.8 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── IMAGE BREAK — árvore solitária ── */}
      <div style={{ position: 'relative', height: 'clamp(220px, 30vw, 380px)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/brand/imagery/02-arvore-solitaria.jpg')", backgroundSize: 'cover', backgroundPosition: 'center 35%', filter: 'sepia(0.22) saturate(1.10) brightness(0.82)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(242,237,228,0.45) 0%, rgba(242,237,228,0) 30%, rgba(242,237,228,0) 70%, rgba(242,237,228,0.60) 100%)' }} />
      </div>

      {/* ── COMO FUNCIONA ── */}
      <section id="como-funciona" style={{ background: BG, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: 'clamp(64px, 8vw, 100px) 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: 56 }}>
            <p style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T_SECONDARY, marginBottom: 16 }}>{l.howEyebrow}</p>
            <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.9rem, 3.5vw, 2.7rem)', fontWeight: 400, lineHeight: 1.12, color: DARK, letterSpacing: '-0.3px', maxWidth: 480 }}>
              {l.howH2}
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 40 }}>
            {STEPS.map((step, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontFamily: F_SANS, fontSize: 28, color: 'rgba(13,13,13,0.14)', letterSpacing: '-1px', lineHeight: 1 }}>{step.num}</span>
                  {i < 2 && <div style={{ flex: 1, height: 1, background: BORDER }} className="hidden lg:block" />}
                </div>
                <h3 style={{ fontFamily: F_DISPLAY, fontSize: '1.2rem', fontWeight: 400, color: DARK, lineHeight: 1.2 }}>{step.title}</h3>
                <p style={{ fontFamily: F_SANS, fontSize: 14, color: T_BODY, lineHeight: 1.8 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PHILOSOPHY STRIP — floresta ao pôr do sol ── */}
      <section style={{ position: 'relative', padding: 'clamp(64px, 8vw, 100px) 24px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/brand/imagery/06-floresta-por-do-sol.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', filter: 'brightness(0.25) sepia(0.40) saturate(1.30)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,8,8,0.70)' }} />
        <div className="arvo-grain" />
        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: 32, height: 1, background: GOLD, margin: '0 auto 32px' }} />
          <p style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.3rem, 3vw, 2.1rem)', fontWeight: 400, fontStyle: 'italic', color: '#fff', lineHeight: 1.55, letterSpacing: '-0.2px' }}>
            "{l.philoQuote}"
          </p>
          <div style={{ marginTop: 32 }}>
            <p style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)' }}>
              {l.philoAuthor}
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ padding: 'clamp(64px, 8vw, 100px) 24px', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ marginBottom: 52 }}>
          <p style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T_SECONDARY, marginBottom: 16 }}>{l.faqEyebrow}</p>
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.7rem, 3vw, 2.3rem)', fontWeight: 400, color: DARK, letterSpacing: '-0.3px' }}>
            {l.faqH2}
          </h2>
        </div>
        <div>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 16 }}>
                <span style={{ fontFamily: F_SANS, fontSize: 'clamp(14px, 1.8vw, 16px)', color: DARK, lineHeight: 1.4 }}>{faq.q}</span>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={T_SECONDARY} strokeWidth={2}
                  style={{ flexShrink: 0, transition: 'transform 0.25s', transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openFaq === i && (
                <div style={{ paddingBottom: 22, fontFamily: F_SANS, fontSize: 15, color: T_BODY, lineHeight: 1.85 }}>{faq.a}</div>
              )}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${BORDER}` }} />
        </div>
      </section>

      {/* ── BOTTOM CTA — broto escuro ── */}
      <section style={{ position: 'relative', padding: 'clamp(64px, 8vw, 100px) 24px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/brand/imagery/07-broto-escuro.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', filter: 'brightness(0.22) sepia(0.35) saturate(1.20)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,8,8,0.75)' }} />
        <div className="arvo-grain" />
        <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: 32, height: 1, background: GOLD, margin: '0 auto 32px' }} />
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.9rem, 4vw, 2.9rem)', fontWeight: 400, lineHeight: 1.10, color: '#fff', letterSpacing: '-0.4px', marginBottom: 18 }}>
            {l.ctaH2}
          </h2>
          <p style={{ fontFamily: F_SANS, fontSize: 15, color: 'rgba(255,255,255,0.58)', lineHeight: 1.75, marginBottom: 40 }}>
            {l.ctaPara}
          </p>
          <Link to="/login?mode=register"
            style={{ display: 'inline-block', fontFamily: F_SANS, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', background: GOLD, color: DARK, textDecoration: 'none', padding: '16px 38px', borderRadius: 2 }}>
            {l.ctaBtn}
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: DARK, padding: '26px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/brand/logo/arvo-symbol-gold.svg" width="16" height="16" alt="" style={{ opacity: 0.38 }} />
            <span style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(200,184,154,0.28)' }}>
              {l.footerSlogan}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to="/privacy" style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)', textDecoration: 'none' }}>{l.footerPrivacy}</Link>
            <Link to="/terms"   style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)', textDecoration: 'none' }}>{l.footerTerms}</Link>
            <Link to="/login"   style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)', textDecoration: 'none' }}>{l.footerEnter}</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
