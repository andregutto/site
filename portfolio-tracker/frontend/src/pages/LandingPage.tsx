import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const PHOTO_URL = '/brand/imagery/01-broto-floresta.jpg'
const GOLD    = '#C8B89A'
const DARK    = '#0D0D0D'
const BG      = '#F2EDE4'
const BORDER  = 'rgba(13,13,13,0.08)'
const GRAY    = 'rgba(13,13,13,0.5)'

const F_SANS    = "'Tenor Sans', sans-serif"
const F_DISPLAY = "'Playfair Display', serif"

const FEATURES = [
  {
    icon: '◈',
    label: 'Portfólio',
    title: 'Todos os seus ativos, um único lugar',
    desc: 'Ações B3, ETFs, criptos, renda fixa, imóveis e FIIs — com cotações ao vivo e histórico de performance.',
  },
  {
    icon: '◎',
    label: 'Multimoeda',
    title: 'Invista sem fronteiras',
    desc: 'Patrimônio em BRL, EUR e USD consolidado na moeda que preferir. Câmbio automático, sem planilha.',
  },
  {
    icon: '▦',
    label: 'Finanças',
    title: 'Controle do que entra e sai',
    desc: 'Importe extratos, categorize gastos, crie orçamentos por envelope. Veja para onde vai seu dinheiro.',
  },
  {
    icon: '◉',
    label: 'Liberdade Financeira',
    title: 'Calcule sua independência',
    desc: 'Defina capital alvo ou renda passiva desejada. Veja sua trajetória mês a mês e saiba quando vai chegar lá.',
  },
  {
    icon: '✦',
    label: 'IA Assistente',
    title: 'Converse com seu portfólio',
    desc: 'Pergunte em linguagem natural: "Quanto investi em renda fixa este ano?" ou "Qual meu maior gasto em outubro?"',
  },
  {
    icon: '◑',
    label: 'Conquistas',
    title: 'Sua jornada tem marcos',
    desc: 'Medalhas e XP a cada avanço — da primeira semente ao clube do milhão. Invista com propósito.',
  },
]

const HOW_IT_WORKS = [
  {
    num: '01',
    title: 'Crie sua conta',
    desc: 'Cadastro em menos de dois minutos. Escolha sua moeda principal e configure as classes de ativos.',
  },
  {
    num: '02',
    title: 'Adicione seus ativos',
    desc: 'Ações, FIIs, cripto, renda fixa, imóveis. Cotações automáticas via B3, Yahoo Finance e CoinGecko.',
  },
  {
    num: '03',
    title: 'Tenha clareza total',
    desc: 'Dashboard com patrimônio consolidado, rentabilidade real, alocação por classe e evolução histórica.',
  },
]

const FAQS = [
  {
    q: 'É gratuito?',
    a: 'Sim. O tracker está em beta e é completamente gratuito. Crie sua conta e comece agora.',
  },
  {
    q: 'Meus dados são seguros?',
    a: 'Seus dados ficam em servidores na União Europeia via Supabase (PostgreSQL com Row-Level Security). Nunca vendemos ou compartilhamos suas informações.',
  },
  {
    q: 'Quais tipos de investimento posso registrar?',
    a: 'Ações B3, ETFs, criptomoedas, renda fixa (CDB, Tesouro, LCI/LCA), FIIs, previdência, imóveis e ativos manuais com valor personalizado.',
  },
  {
    q: 'Funciona para quem mora fora do Brasil?',
    a: 'É exatamente para isso que foi construído. Criado por um brasileiro na França, o arvo consolida ativos brasileiros e europeus numa só visão, com suporte a BRL, EUR e USD.',
  },
  {
    q: 'Posso importar extratos bancários?',
    a: 'Sim. Faça upload de um CSV e o sistema importa automaticamente suas transações para categorização e controle de orçamento.',
  },
  {
    q: 'Tem app mobile?',
    a: 'O arvo é uma PWA (Progressive Web App) — funciona no celular pelo navegador com experiência próxima de um app nativo.',
  },
]

export default function LandingPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const [openFaq,       setOpenFaq]       = useState<number | null>(null)
  const [menuOpen,      setMenuOpen]       = useState(false)
  const [loginOpen,     setLoginOpen]     = useState(false)
  const [loginEmail,    setLoginEmail]    = useState('')
  const [loginPass,     setLoginPass]     = useState('')
  const [loginErr,      setLoginErr]      = useState('')
  const [loginLoading,  setLoginLoading]  = useState(false)
  const [mobileLoginOpen, setMobileLoginOpen] = useState(false)

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
    <div style={{ background: BG, color: DARK, fontFamily: F_SANS, minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── HEADER ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(242,237,228,0.95)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          <a href="#hero" style={{ textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/brand/logo/arvo-symbol-black.svg" width="20" height="20" alt="" />
            <span style={{ fontFamily: F_SANS, fontSize: 15, letterSpacing: '0.30em', textIndent: '0.30em', color: DARK, lineHeight: 1 }}>arvo</span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex" style={{ alignItems: 'center', gap: 36 }}>
            {[['#funcionalidades','Funcionalidades'],['#como-funciona','Como funciona'],['#faq','FAQ']].map(([href, label]) => (
              <a key={href} href={href} style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: GRAY, textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = DARK)}
                onMouseLeave={e => (e.currentTarget.style.color = GRAY)}
              >{label}</a>
            ))}
          </nav>

          {/* Desktop right actions */}
          <div className="hidden md:flex" style={{ alignItems: 'center', gap: 12 }}>

            {/* Entrar → login popover */}
            <div ref={loginRef} style={{ position: 'relative' }}>
              <button
                onClick={() => { setLoginOpen(o => !o); setLoginErr('') }}
                style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: DARK, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Entrar
              </button>

              {loginOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 12px)', right: 0, background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.10)', padding: '24px 22px', width: 280, zIndex: 10 }}>
                  <p style={{ fontFamily: F_DISPLAY, fontSize: 16, fontWeight: 400, color: DARK, marginBottom: 18 }}>Entrar na sua conta</p>
                  <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <input type="email" required autoFocus placeholder="E-mail" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                      style={{ fontFamily: F_SANS, fontSize: 13, padding: '9px 12px', border: `1px solid ${BORDER}`, borderRadius: 4, outline: 'none', color: DARK, background: BG }}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.boxShadow = `0 0 0 2px rgba(200,184,154,0.25)` }}
                      onBlur={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = 'none' }}
                    />
                    <input type="password" required placeholder="Senha" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                      style={{ fontFamily: F_SANS, fontSize: 13, padding: '9px 12px', border: `1px solid ${BORDER}`, borderRadius: 4, outline: 'none', color: DARK, background: BG }}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.boxShadow = `0 0 0 2px rgba(200,184,154,0.25)` }}
                      onBlur={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = 'none' }}
                    />
                    {loginErr && <p style={{ fontFamily: F_SANS, fontSize: 12, color: '#dc2626', margin: 0 }}>{loginErr}</p>}
                    <button type="submit" disabled={loginLoading}
                      style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: DARK, color: '#fff', border: 'none', borderRadius: 4, padding: '10px 0', cursor: 'pointer', opacity: loginLoading ? 0.6 : 1, marginTop: 4 }}
                    >
                      {loginLoading ? 'Entrando…' : 'Entrar'}
                    </button>
                  </form>
                  <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link to="/login?mode=forgot" onClick={() => setLoginOpen(false)}
                      style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.08em', color: GRAY, textDecoration: 'none' }}>
                      Esqueci a senha
                    </Link>
                    <Link to="/login?mode=register" onClick={() => setLoginOpen(false)}
                      style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.08em', color: DARK, textDecoration: 'none' }}>
                      Criar conta
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <Link to="/login?mode=register" style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: DARK, color: '#fff', textDecoration: 'none', padding: '9px 20px', borderRadius: 3 }}>
              Criar conta grátis
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
          <div className="md:hidden" style={{ background: 'rgba(242,237,228,0.98)', borderTop: `1px solid ${BORDER}`, padding: '8px 20px 20px' }}>
            {[['#funcionalidades','Funcionalidades'],['#como-funciona','Como funciona'],['#faq','FAQ']].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}
                style={{ display: 'flex', alignItems: 'center', padding: '14px 0', fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: GRAY, textDecoration: 'none', borderBottom: `1px solid ${BORDER}` }}>
                {label}
              </a>
            ))}
            {!mobileLoginOpen ? (
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button onClick={() => { setMobileLoginOpen(true); setLoginErr('') }}
                  style={{ flex: 1, textAlign: 'center', padding: '12px 0', fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: DARK, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 3, cursor: 'pointer' }}>
                  Entrar
                </button>
                <Link to="/login?mode=register" onClick={() => setMenuOpen(false)}
                  style={{ flex: 1, textAlign: 'center', padding: '12px 0', fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: DARK, color: '#fff', textDecoration: 'none', borderRadius: 3 }}>
                  Criar conta
                </Link>
              </div>
            ) : (
              <form onSubmit={async e => { await handleLogin(e); if (!loginErr) setMenuOpen(false) }}
                style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input type="email" required autoFocus placeholder="E-mail" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  style={{ fontFamily: F_SANS, fontSize: 13, padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 4, color: DARK, background: BG }} />
                <input type="password" required placeholder="Senha" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                  style={{ fontFamily: F_SANS, fontSize: 13, padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 4, color: DARK, background: BG }} />
                {loginErr && <p style={{ fontFamily: F_SANS, fontSize: 12, color: '#dc2626', margin: 0 }}>{loginErr}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setMobileLoginOpen(false)}
                    style={{ flex: 1, padding: '11px 0', fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'none', border: `1px solid ${BORDER}`, borderRadius: 3, cursor: 'pointer', color: GRAY }}>
                    Voltar
                  </button>
                  <button type="submit" disabled={loginLoading}
                    style={{ flex: 2, padding: '11px 0', fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: DARK, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', opacity: loginLoading ? 0.6 : 1 }}>
                    {loginLoading ? 'Entrando…' : 'Entrar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section id="hero" style={{ position: 'relative', minHeight: '92vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        {/* Dark base + photo overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #080f1c 0%, #0D0D0D 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${PHOTO_URL}')`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'brightness(0.30) sepia(0.35) saturate(1.15)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', background: 'linear-gradient(to top, rgba(6,12,24,0.95) 0%, transparent 100%)' }} />
        <div className="arvo-grain" />

        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '0 20px 80px', width: '100%' }}>

          {/* Eyebrow */}
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.50)' }}>
              Para brasileiros que moram fora do Brasil · Beta gratuito
            </span>
          </div>

          {/* H1 — April Dunford: say exactly what it does */}
          <h1 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(2.4rem, 6vw, 4.8rem)', fontWeight: 400, lineHeight: 1.06, color: '#fff', marginBottom: 24, letterSpacing: '-0.5px', maxWidth: 800 }}>
            Seu portfólio brasileiro<br />
            <em style={{ fontStyle: 'italic', color: `${GOLD}CC` }}>e europeu, numa tela só.</em>
          </h1>

          {/* Sub — Hormozi: dream outcome + proof */}
          <p style={{ fontFamily: F_SANS, fontSize: 'clamp(15px, 2vw, 18px)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: 560, marginBottom: 40 }}>
            Ações B3, FIIs, criptos, renda fixa e ativos no exterior — cotações ao vivo, câmbio automático e controle de gastos. Em BRL, EUR ou USD.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link to="/login?mode=register" style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', background: GOLD, color: DARK, textDecoration: 'none', padding: '15px 32px', borderRadius: 2 }}>
              Criar conta grátis
            </Link>
            <Link to="/login" style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', textDecoration: 'none', padding: '15px 32px', borderRadius: 2, border: '1px solid rgba(255,255,255,0.15)' }}>
              Já tenho conta
            </Link>
          </div>

          {/* Small reassurance — Hormozi: remove risk */}
          <p style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.28)', marginTop: 16 }}>
            Grátis para sempre no beta · Sem cartão de crédito · Dados na União Europeia
          </p>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <div style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '24px 20px' }}>
          {[
            { value: '6+',           label: 'Classes de ativos' },
            { value: 'BRL · EUR · USD', label: 'Multimoeda nativo' },
            { value: '30+',          label: 'Conquistas e níveis' },
            { value: 'IA',           label: 'Assistente financeiro' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.4rem, 2.8vw, 1.9rem)', fontWeight: 400, color: DARK, marginBottom: 6 }}>{s.value}</div>
              <div style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: GRAY, lineHeight: 1.4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FUNCIONALIDADES ── */}
      <section id="funcionalidades" style={{ padding: 'clamp(60px, 8vw, 96px) 20px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 52 }}>
          <p style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: GRAY, marginBottom: 14 }}>Funcionalidades</p>
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.15, color: DARK, letterSpacing: '-0.3px', maxWidth: 540 }}>
            Tudo que você precisa para crescer com consciência
          </h2>
        </div>

        <div style={{ display: 'grid', gap: 1, background: BORDER }} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: BG, padding: 'clamp(28px, 4vw, 40px) clamp(24px, 3vw, 36px)' }}>
              <div style={{ fontFamily: F_SANS, fontSize: 18, color: DARK, marginBottom: 14, lineHeight: 1 }}>{f.icon}</div>
              <p style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: GRAY, marginBottom: 10 }}>{f.label}</p>
              <h3 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1rem, 1.8vw, 1.25rem)', fontWeight: 400, color: DARK, marginBottom: 10, lineHeight: 1.25 }}>{f.title}</h3>
              <p style={{ fontFamily: F_SANS, fontSize: 14, color: GRAY, lineHeight: 1.75 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section id="como-funciona" style={{ background: BG, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: 'clamp(60px, 8vw, 96px) 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: 52 }}>
            <p style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: GRAY, marginBottom: 14 }}>Como funciona</p>
            <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.15, color: DARK, letterSpacing: '-0.3px', maxWidth: 460 }}>
              Três passos para ter clareza total
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 40 }}>
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontFamily: F_SANS, fontSize: 26, color: 'rgba(13,13,13,0.12)', letterSpacing: '-1px', lineHeight: 1 }}>{step.num}</span>
                  {i < 2 && <div style={{ flex: 1, height: 1, background: BORDER }} className="hidden lg:block" />}
                </div>
                <h3 style={{ fontFamily: F_DISPLAY, fontSize: '1.2rem', fontWeight: 400, color: DARK, lineHeight: 1.2 }}>{step.title}</h3>
                <p style={{ fontFamily: F_SANS, fontSize: 14, color: GRAY, lineHeight: 1.75 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PHILOSOPHY STRIP ── */}
      <section style={{ background: DARK, padding: 'clamp(60px, 8vw, 96px) 20px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: 32, height: 1, background: GOLD, margin: '0 auto 28px' }} />
          <p style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.3rem, 3vw, 2rem)', fontWeight: 400, fontStyle: 'italic', color: '#fff', lineHeight: 1.5, letterSpacing: '-0.2px' }}>
            "Construído por um brasileiro na França — para quem tem ativos em mais de um país e precisa de uma visão clara de tudo."
          </p>
          <div style={{ marginTop: 28 }}>
            <p style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.30)' }}>
              André Gutto · Paris, França
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ padding: 'clamp(60px, 8vw, 96px) 20px', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ marginBottom: 48 }}>
          <p style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: GRAY, marginBottom: 14 }}>FAQ</p>
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 400, color: DARK, letterSpacing: '-0.3px' }}>
            Perguntas frequentes
          </h2>
        </div>
        <div>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 16 }}>
                <span style={{ fontFamily: F_SANS, fontSize: 'clamp(14px, 1.8vw, 16px)', color: DARK, lineHeight: 1.4 }}>{faq.q}</span>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={GRAY} strokeWidth={2}
                  style={{ flexShrink: 0, transition: 'transform 0.25s', transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openFaq === i && (
                <div style={{ paddingBottom: 20, fontFamily: F_SANS, fontSize: 15, color: GRAY, lineHeight: 1.8 }}>{faq.a}</div>
              )}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${BORDER}` }} />
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{ background: DARK, padding: 'clamp(60px, 8vw, 96px) 20px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: 32, height: 1, background: GOLD, margin: '0 auto 28px' }} />
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 400, lineHeight: 1.12, color: '#fff', letterSpacing: '-0.4px', marginBottom: 16 }}>
            Pronto para ter clareza sobre seu patrimônio?
          </h2>
          <p style={{ fontFamily: F_SANS, fontSize: 15, color: 'rgba(255,255,255,0.50)', lineHeight: 1.7, marginBottom: 36 }}>
            Crie sua conta em menos de dois minutos. Sem cartão de crédito. Grátis para sempre no beta.
          </p>
          <Link to="/login?mode=register" style={{ display: 'inline-block', fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', background: GOLD, color: DARK, textDecoration: 'none', padding: '15px 36px', borderRadius: 2 }}>
            Plantar minha primeira semente
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: DARK, padding: '24px 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/brand/logo/arvo-symbol-gold.svg" width="16" height="16" alt="" style={{ opacity: 0.4 }} />
            <span style={{ fontFamily: F_SANS, fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(200,184,154,0.30)' }}>
              arvo — cultive o que é seu — 2026
            </span>
          </div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to="/privacy" style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.30)', textDecoration: 'none' }}>Privacidade</Link>
            <Link to="/terms"   style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.30)', textDecoration: 'none' }}>Termos</Link>
            <Link to="/login"   style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.30)', textDecoration: 'none' }}>Entrar</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
