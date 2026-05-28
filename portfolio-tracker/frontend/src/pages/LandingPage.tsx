import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { supabase } from '../lib/supabase'
import LanguageSelector from '../components/LanguageSelector'

const DARK  = '#0D0D0D'
const GOLD  = '#C8B89A'
const BG    = '#FFFFFF'
const BORDER = 'rgba(13,13,13,0.09)'
// Text hierarchy on beige/offwhite — NEVER use raw gray-* classes on light bg
const T_PRIMARY   = 'rgba(13,13,13,0.92)'   // headings
const T_BODY      = 'rgba(13,13,13,0.78)'   // body paragraphs
const T_SECONDARY = 'rgba(13,13,13,0.72)'   // labels / eyebrows / metadata

const F_SANS    = "'Tenor Sans', sans-serif"
const F_DISPLAY = "'Playfair Display', serif"

const ICONS = ['◈', '◎', '▦', '◉', '✦', '◑']
const FEATURE_COLORS = ['#1F8A5B', '#1B4FD8', '#A36A52', '#E8A020', '#1B4FD8', '#A36A52']

const TABLE_ROWS: [string, string, string, string, string][] = [
  ['BOVA11',   'ETF',     'R$45,2k', '+5,8%',  '#1F8A5B'],
  ['WEGE3',    'Ação',    'R$38,7k', '+12,4%', '#1F8A5B'],
  ['BTC',      'Cripto',  'R$28,4k', '-2,1%',  '#D63B2F'],
  ['KNRI11',   'FII',     'R$21,3k', '+3,2%',  '#1F8A5B'],
  ['IVV',      'ETF EUA', 'R$18,9k', '+7,6%',  '#1F8A5B'],
  ['TESOURO+', 'Renda F.','R$52,0k', '+1,1%',  '#1F8A5B'],
]

interface MockupLabels {
  td: Record<string, string>
  tn: Record<string, string>
  tc: Record<string, string>
  ti: Record<string, string>
}

const ALLOC_ROWS: [string, string, string, string][] = [
  ['#1B4FD8', 'classAcoesBrasil',  '38%', 'R$ 108.000'],
  ['#A36A52', 'classFiis',         '22%', 'R$ 63.000'],
  ['#C8B89A', 'classRendaFixa',    '20%', 'R$ 57.000'],
  ['#0D0D0D', 'classCripto',       '12%', 'R$ 34.000'],
  ['#E8A020', 'classAcoesExterior','8%',  'R$ 23.000'],
]

const MOCK_INDICES: [string, string, string, string][] = [
  ['Ibovespa', '130.450', '+1,2%', '#1F8A5B'],
  ['CDI',      '10,50%',  '+0,05%','#1F8A5B'],
  ['S&P 500',  '5.210',   '+2,8%', '#1F8A5B'],
  ['IPCA',     '4,83%',   '-0,1%', '#D63B2F'],
]

function DashboardMockupContent({ td, tn, tc, ti }: MockupLabels) {
  const FS = "'DM Sans', system-ui, sans-serif"
  const FD = "'Tenor Sans', serif"

  return (
    <div style={{ width: 1280, height: '100%', background: '#F4F4F4', fontFamily: FS, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── App header ── */}
      <header style={{ height: 56, flexShrink: 0, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(13,13,13,0.08)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <img src="/brand/logo/arvo-symbol-black.svg" width="22" height="22" alt="" />
          <span style={{ fontFamily: FD, fontSize: 16, letterSpacing: '0.30em', color: DARK, lineHeight: 1 }}>arvo</span>
        </div>
        <div style={{ width: 1, height: 22, background: 'rgba(13,13,13,0.12)', flexShrink: 0 }} />
        <span style={{ fontFamily: FD, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.50)', flexShrink: 0 }}>Capital</span>
        <nav style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 4 }}>
          {([tn.investments, tn.finances, tn.institutions] as string[]).map((label, i) => (
            <span key={i} style={{ padding: '6px 18px', borderRadius: 99, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', background: i === 0 ? DARK : 'transparent', color: i === 0 ? '#fff' : 'rgba(13,13,13,0.62)', fontFamily: FS, whiteSpace: 'nowrap' }}>{label}</span>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: GOLD, letterSpacing: '0.08em' }}>AG</div>
          <span style={{ fontSize: 12, color: 'rgba(13,13,13,0.50)' }}>André</span>
          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="rgba(13,13,13,0.38)" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
        </div>
      </header>

      {/* ── Sub-nav ── */}
      <div style={{ height: 40, flexShrink: 0, background: '#fff', borderBottom: '1px solid rgba(13,13,13,0.06)', display: 'flex', alignItems: 'stretch', padding: '0 24px', overflow: 'hidden' }}>
        {([
          { label: tn.dashboard, active: true },
          { label: tn.performance, active: false },
          { label: tn.dividends, active: false },
          { label: tn.contributions, active: false },
          { label: tn.rebalance, active: false },
          { label: tn.classes, active: false },
        ] as Array<{ label: string; active: boolean }>).map(({ label, active }, i) => (
          <span key={i} style={{ padding: '0 16px', display: 'flex', alignItems: 'center', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: active ? DARK : 'rgba(13,13,13,0.42)', borderBottom: active ? `2px solid ${DARK}` : '2px solid transparent', fontFamily: FS, whiteSpace: 'nowrap', flexShrink: 0 }}>{label}</span>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, padding: '20px 24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Period selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontFamily: FD, fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.50)' }}>Dashboard</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(['Mês', 'YTD', '12M', 'Início'] as const).map((lbl, i) => (
              <span key={lbl} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', border: i === 1 ? `1px solid ${DARK}` : '1px solid rgba(13,13,13,0.18)', background: i === 1 ? DARK : '#fff', color: i === 1 ? '#fff' : 'rgba(13,13,13,0.52)', fontFamily: FS }}>{lbl}</span>
            ))}
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="rgba(13,13,13,0.42)" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </div>
        </div>

        {/* ValueCard */}
        <div style={{ flexShrink: 0, background: '#fff', borderRadius: 16, padding: 20, position: 'relative', overflow: 'hidden', border: '1px solid rgba(200,184,154,0.35)', boxShadow: '0 4px 24px rgba(200,184,154,0.18), 0 1px 0 rgba(200,184,154,0.22)' }}>
          <div style={{ position: 'absolute', top: -120, right: -60, width: 360, height: 360, borderRadius: '50%', background: 'rgba(200,184,154,0.10)', filter: 'blur(70px)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(to right, transparent, rgba(200,184,154,0.65), transparent)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 2 }}>
            <div>
              <p style={{ fontFamily: FS, fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: '#8C6A28', margin: 0 }}>Total BRL</p>
              <p style={{ fontFamily: FS, fontSize: 36, letterSpacing: '0.02em', lineHeight: 1.05, color: DARK, margin: '6px 0 0' }}>R$ 284.500</p>
            </div>
            <span style={{ fontFamily: FS, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.52)', marginTop: 4 }}>14:30</span>
          </div>
          <div style={{ position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 24px', marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(13,13,13,0.08)' }}>
            {([
              { label: td.invested,      val: 'R$ 236.000',           color: DARK },
              { label: td.result,        val: '+R$ 48.500 (+20,6%)',   color: '#1F8A5B' },
              { label: td.currentMonth,  val: '+1,4%',                 color: '#1F8A5B' },
              { label: 'YTD 2025',       val: '+8,2%',                 color: '#1F8A5B' },
            ] as Array<{ label: string; val: string; color: string }>).map(({ label, val, color }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontFamily: FS, fontSize: 11, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.60)' }}>{label}</span>
                <span style={{ fontFamily: FS, fontSize: 16, letterSpacing: '0.02em', color }}>{val}</span>
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px 8px', marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(13,13,13,0.07)' }}>
            {MOCK_INDICES.map(([name, val, pct, color]) => (
              <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontFamily: FS, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.40)' }}>{name}</span>
                <span style={{ fontFamily: FS, fontSize: 14, color: DARK, lineHeight: 1 }}>{val}</span>
                <span style={{ fontFamily: FS, fontSize: 11, color }}>{pct} <span style={{ color: 'rgba(13,13,13,0.35)' }}>{ti.month ?? 'mês'}</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* Allocation chart */}
        <div style={{ flexShrink: 0, background: '#fff', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(13,13,13,0.08)' }}>
          <div style={{ fontFamily: FS, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.52)', marginBottom: 12 }}>{td.allocationByClass}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <svg width="90" height="90" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
              <circle cx="40" cy="40" r="28" fill="none" stroke="#f3f4f6" strokeWidth="13"/>
              <circle cx="40" cy="40" r="28" fill="none" stroke="#1B4FD8" strokeWidth="13" strokeDasharray="67 109" strokeDashoffset="0" transform="rotate(-90 40 40)"/>
              <circle cx="40" cy="40" r="28" fill="none" stroke="#A36A52" strokeWidth="13" strokeDasharray="39 137" strokeDashoffset="-67" transform="rotate(-90 40 40)"/>
              <circle cx="40" cy="40" r="28" fill="none" stroke="#C8B89A" strokeWidth="13" strokeDasharray="35 141" strokeDashoffset="-106" transform="rotate(-90 40 40)"/>
              <circle cx="40" cy="40" r="28" fill="none" stroke="#0D0D0D" strokeWidth="13" strokeDasharray="21 155" strokeDashoffset="-141" transform="rotate(-90 40 40)"/>
              <circle cx="40" cy="40" r="28" fill="none" stroke="#E8A020" strokeWidth="13" strokeDasharray="14 162" strokeDashoffset="-162" transform="rotate(-90 40 40)"/>
            </svg>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 40px', flex: 1 }}>
              {ALLOC_ROWS.map(([color, classKey, pct, val]) => (
                <div key={classKey} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'rgba(13,13,13,0.75)', fontFamily: FS, whiteSpace: 'nowrap' }}>{tc[classKey] ?? classKey}</span>
                      <span style={{ fontSize: 11, color: 'rgba(13,13,13,0.42)', fontFamily: FS }}>{pct}</span>
                    </div>
                    <span style={{ fontSize: 11, fontStyle: 'italic', color: 'rgba(13,13,13,0.42)', fontFamily: FS }}>{val}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Evolution chart */}
        <div style={{ flexShrink: 0, background: '#fff', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(13,13,13,0.08)' }}>
          <div style={{ fontFamily: FS, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.52)', marginBottom: 10 }}>{td.portfolioEvolution}</div>
          <svg width="100%" height="80" viewBox="0 0 1200 80" preserveAspectRatio="none" style={{ display: 'block' }}>
            <defs><linearGradient id="evGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0D0D0D" stopOpacity="0.07"/><stop offset="100%" stopColor="#0D0D0D" stopOpacity="0"/></linearGradient></defs>
            <line x1="0" y1="55" x2="1200" y2="55" stroke="#f0f0f0" strokeWidth="1"/>
            <line x1="0" y1="30" x2="1200" y2="30" stroke="#f0f0f0" strokeWidth="1"/>
            <path d="M 0 72 C 100 70 200 65 350 55 C 500 45 600 38 750 28 C 900 18 1050 10 1200 5 L 1200 80 L 0 80 Z" fill="url(#evGrad)"/>
            <path d="M 0 72 C 100 70 200 65 350 55 C 500 45 600 38 750 28 C 900 18 1050 10 1200 5" fill="none" stroke={DARK} strokeWidth="2"/>
            {(['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'] as const).map((lbl, i) => (
              <text key={lbl} x={i * 109} y={79} fontSize="9" fill="rgba(13,13,13,0.35)" textAnchor={i === 0 ? 'start' : i === 11 ? 'end' : 'middle'} fontFamily={FS}>{lbl}</text>
            ))}
          </svg>
        </div>

        {/* Asset table */}
        <div style={{ flex: 1, background: '#fff', borderRadius: 16, border: '1px solid rgba(13,13,13,0.08)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr', padding: '10px 20px', background: 'rgba(248,247,245,0.9)', borderBottom: '1px solid rgba(13,13,13,0.05)' }}>
            {([td.asset?.charAt(0).toUpperCase() + (td.asset?.slice(1) ?? ''), td.colHoldings, td.colValue, td.colReturn] as string[]).map(h => (
              <span key={h} style={{ fontFamily: FS, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.38)' }}>{h}</span>
            ))}
          </div>
          {TABLE_ROWS.map(([ticker, classe, valor, pct, color]) => (
            <div key={ticker} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr', padding: '11px 20px', borderBottom: '1px solid rgba(13,13,13,0.04)', alignItems: 'center' }}>
              <span style={{ fontFamily: FS, fontSize: 13, fontWeight: 600, color: DARK }}>{ticker}</span>
              <span style={{ fontFamily: FS, fontSize: 12, color: 'rgba(13,13,13,0.50)' }}>{classe}</span>
              <span style={{ fontFamily: FS, fontSize: 13, color: DARK }}>{valor}</span>
              <span style={{ fontFamily: FS, fontSize: 13, color }}>{pct}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

export default function LandingPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const l = (t as unknown as Record<string, Record<string, string>>).landing ?? {}

  const FEATURES = [
    { icon: ICONS[0], color: FEATURE_COLORS[0], label: l.f1label, title: l.f1title, desc: l.f1desc },
    { icon: ICONS[1], color: FEATURE_COLORS[1], label: l.f2label, title: l.f2title, desc: l.f2desc },
    { icon: ICONS[2], color: FEATURE_COLORS[2], label: l.f3label, title: l.f3title, desc: l.f3desc },
    { icon: ICONS[3], color: FEATURE_COLORS[3], label: l.f4label, title: l.f4title, desc: l.f4desc },
    { icon: ICONS[4], color: FEATURE_COLORS[4], label: l.f5label, title: l.f5title, desc: l.f5desc },
    { icon: ICONS[5], color: FEATURE_COLORS[5], label: l.f6label, title: l.f6title, desc: l.f6desc },
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
  const [loginResending,   setLoginResending]    = useState(false)
  const [loginResent,      setLoginResent]       = useState(false)
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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible') }),
      { threshold: 0.08 }
    )
    document.querySelectorAll('.arvo-reveal').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginErr('')
    setLoginResent(false)
    setLoginLoading(true)
    try {
      await signIn(loginEmail, loginPass)
      navigate('/dashboard')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (/email not confirmed/i.test(msg)) setLoginErr(t.login.errEmailNotConfirmed)
      else if (/invalid login credentials/i.test(msg)) setLoginErr(t.login.errInvalidCredentials)
      else if (/too many requests|rate limit/i.test(msg)) setLoginErr(t.login.errTooManyRequests)
      else setLoginErr(msg || 'Erro desconhecido')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleResendFromOverlay() {
    if (!loginEmail || loginResending || loginResent) return
    setLoginResending(true)
    await supabase.auth.resend({ type: 'signup', email: loginEmail })
    setLoginResending(false)
    setLoginResent(true)
  }

  return (
    <div style={{ background: BG, color: T_PRIMARY, fontFamily: F_SANS, minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── HEADER ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${BORDER}`, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
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
                    {loginErr && (
                      <div style={{ fontFamily: F_SANS, fontSize: 12, color: '#dc2626', margin: 0 }}>
                        <p style={{ margin: 0 }}>{loginErr}</p>
                        {loginErr === t.login.errEmailNotConfirmed && (
                          <div style={{ marginTop: 8 }}>
                            {loginResent ? (
                              <p style={{ margin: 0, fontSize: 11, color: '#166534' }}>{t.login.emailResent ?? 'E-mail reenviado.'}</p>
                            ) : (
                              <button type="button" onClick={handleResendFromOverlay} disabled={loginResending || !loginEmail}
                                style={{ background: 'none', border: '1px solid #dc2626', borderRadius: 3, padding: '4px 10px', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#dc2626', cursor: loginResending || !loginEmail ? 'not-allowed' : 'pointer', opacity: loginResending || !loginEmail ? 0.6 : 1 }}>
                                {loginResending ? '...' : (t.login.resendEmail ?? 'Reenviar e-mail')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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
          <div className="md:hidden" style={{ background: 'rgba(255,255,255,0.98)', borderTop: `1px solid ${BORDER}`, padding: '8px 24px 20px' }}>
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
                {loginErr && (
                  <div style={{ fontFamily: F_SANS, fontSize: 12, color: '#dc2626', margin: 0 }}>
                    <p style={{ margin: 0 }}>{loginErr}</p>
                    {loginErr === t.login.errEmailNotConfirmed && (
                      <div style={{ marginTop: 8 }}>
                        {loginResent ? (
                          <p style={{ margin: 0, fontSize: 11, color: '#166534' }}>{t.login.emailResent ?? 'E-mail reenviado.'}</p>
                        ) : (
                          <button type="button" onClick={handleResendFromOverlay} disabled={loginResending || !loginEmail}
                            style={{ background: 'none', border: '1px solid #dc2626', borderRadius: 3, padding: '4px 10px', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#dc2626', cursor: loginResending || !loginEmail ? 'not-allowed' : 'pointer', opacity: loginResending || !loginEmail ? 0.6 : 1 }}>
                            {loginResending ? '...' : (t.login.resendEmail ?? 'Reenviar e-mail')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', background: 'linear-gradient(to top, rgba(6,12,24,0.90) 0%, transparent 100%)' }} />
        <div className="arvo-grain" />

        {/* Right mockup — absolute, full hero height, right 55%, clips to ~60% visible */}
        <div className="hidden lg:block" style={{ position: 'absolute', top: 0, right: 0, width: '55%', height: '100%', overflow: 'hidden', zIndex: 1 }}>
          {/* Left-edge blend */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 220, background: 'linear-gradient(to right, rgba(6,12,24,0.98) 0%, transparent 100%)', zIndex: 3, pointerEvents: 'none' }} />
          {/* Top-edge blend */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 100, background: 'linear-gradient(to bottom, rgba(6,12,24,0.95) 0%, transparent 100%)', zIndex: 3, pointerEvents: 'none' }} />
          {/* Bottom-edge blend */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 140, background: 'linear-gradient(to top, rgba(6,12,24,0.90) 0%, transparent 100%)', zIndex: 3, pointerEvents: 'none' }} />
          {/* Drop shadow on the left edge of the frame */}
          <div style={{ position: 'absolute', top: 56, left: 0, bottom: 0, boxShadow: '-12px 0 48px rgba(0,0,0,0.55)', zIndex: 2, pointerEvents: 'none', width: 1 }} />
          <DashboardMockupContent
            td={(t as unknown as Record<string, Record<string, string>>).dashboard ?? {}}
            tn={(t as unknown as Record<string, Record<string, string>>).nav ?? {}}
            tc={((t as unknown as Record<string, Record<string, Record<string, string>>>).classes?.names ?? {}) as Record<string, string>}
            ti={(t as unknown as Record<string, Record<string, string>>).indices ?? {}}
          />
        </div>

        {/* Left text — constrained to left half */}
        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '0 24px', width: '100%', zIndex: 2 }}>
          <div style={{ maxWidth: 540, paddingTop: 'clamp(80px, 10vh, 120px)', paddingBottom: 'clamp(48px, 6vh, 72px)' }}>
            <div style={{ marginBottom: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontFamily: F_SANS, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>
                {l.eyebrow}
              </span>
            </div>

            <h1 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(2rem, 3.8vw, 3.6rem)', fontWeight: 400, lineHeight: 1.08, color: '#fff', marginBottom: 26, letterSpacing: '-0.3px' }}>
              {l.h1line1}<br />
              <em style={{ fontStyle: 'italic', color: `${GOLD}CC` }}>{l.h1line2}</em>
            </h1>

            <p style={{ fontFamily: F_SANS, fontSize: 'clamp(15px, 2vw, 18px)', color: 'rgba(255,255,255,0.72)', lineHeight: 1.75, marginBottom: 40 }}>
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
          ].map((s, i) => (
            <div key={s.label} className={`arvo-reveal arvo-reveal-d${i + 1}`}>
              <div style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.5rem, 2.8vw, 2rem)', fontWeight: 400, color: DARK, marginBottom: 6 }}>{s.value}</div>
              <div style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: T_SECONDARY, lineHeight: 1.4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FUNCIONALIDADES ── */}
      <section id="funcionalidades" style={{ padding: 'clamp(64px, 8vw, 100px) 24px', maxWidth: 1200, margin: '0 auto' }}>
        <div className="arvo-reveal" style={{ marginBottom: 56 }}>
          <p style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T_SECONDARY, marginBottom: 16 }}>{l.featEyebrow}</p>
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.9rem, 3.5vw, 2.7rem)', fontWeight: 400, lineHeight: 1.12, color: DARK, letterSpacing: '-0.3px', maxWidth: 560 }}>
            {l.featH2}
          </h2>
        </div>

        <div style={{ display: 'grid', gap: 1, background: BORDER }} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={i} className={`arvo-reveal arvo-reveal-d${i + 1}`} style={{ background: '#fff', padding: 'clamp(28px, 4vw, 40px) clamp(24px, 3vw, 36px)' }}>
              <div style={{ fontFamily: F_SANS, fontSize: 24, color: f.color, marginBottom: 14, lineHeight: 1 }}>{f.icon}</div>
              <p style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T_SECONDARY, marginBottom: 10 }}>{f.label}</p>
              <h3 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1rem, 1.8vw, 1.25rem)', fontWeight: 400, color: DARK, marginBottom: 10, lineHeight: 1.25 }}>{f.title}</h3>
              <p style={{ fontFamily: F_SANS, fontSize: 14, color: T_BODY, lineHeight: 1.8 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── IMAGE BREAK — árvore solitária ── */}
      <div style={{ position: 'relative', height: 'clamp(220px, 30vw, 380px)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/brand/imagery/02-arvore-solitaria.jpg')", backgroundSize: 'cover', backgroundPosition: 'center 55%', filter: 'sepia(0.22) saturate(1.10) brightness(0.82)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(242,237,228,0.45) 0%, rgba(242,237,228,0) 30%, rgba(242,237,228,0) 70%, rgba(242,237,228,0.60) 100%)' }} />
      </div>

      {/* ── COMO FUNCIONA ── */}
      <section id="como-funciona" style={{ background: BG, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: 'clamp(64px, 8vw, 100px) 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="arvo-reveal" style={{ marginBottom: 56 }}>
            <p style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T_SECONDARY, marginBottom: 16 }}>{l.howEyebrow}</p>
            <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.9rem, 3.5vw, 2.7rem)', fontWeight: 400, lineHeight: 1.12, color: DARK, letterSpacing: '-0.3px', maxWidth: 480 }}>
              {l.howH2}
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 40 }}>
            {STEPS.map((step, i) => (
              <div key={i} className={`arvo-reveal arvo-reveal-d${i + 1}`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: DARK, padding: '20px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/brand/logo/arvo-symbol-gold.svg" width="14" height="14" alt="" style={{ opacity: 0.35 }} />
            <span style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.22em', color: 'rgba(200,184,154,0.30)' }}>
              {l.footerSlogan}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to="/privacy" style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.30)', textDecoration: 'none' }}>{l.footerPrivacy}</Link>
            <Link to="/terms"   style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.30)', textDecoration: 'none' }}>{l.footerTerms}</Link>
            <Link to="/login"   style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.30)', textDecoration: 'none' }}>{l.footerEnter}</Link>
            <a href="https://www.instagram.com/andregutto/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" style={{ color: 'rgba(255,255,255,0.30)', lineHeight: 0 }}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            </a>
            <a href="https://www.youtube.com/@andregutto" target="_blank" rel="noopener noreferrer" aria-label="YouTube" style={{ color: 'rgba(255,255,255,0.30)', lineHeight: 0 }}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            </a>
          </div>
        </div>
      </footer>

    </div>
  )
}
