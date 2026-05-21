import { useState } from 'react'
import { Link } from 'react-router-dom'

const BLUE    = '#1B2F4E'
const BG      = '#FAFAF8'
const DARK    = '#111110'
const GRAY    = '#6B6B67'
const BORDER  = '#E0DDD5'
const GOLD    = '#C9A227'

const F_DISPLAY = "'Playfair Display', serif"
const F_MONO    = "'DM Mono', monospace"
const F_BODY    = "'DM Sans', sans-serif"

const PHOTO_URL = 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1800&q=80'

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
    desc: 'Gerencie ativos em BRL, EUR e USD. Patrimônio consolidado na moeda que preferir, câmbio automático.',
  },
  {
    icon: '▦',
    label: 'Finanças',
    title: 'Controle do que entra e sai',
    desc: 'Importe extratos, categorize gastos, crie orçamentos por envelope e veja para onde vai seu dinheiro.',
  },
  {
    icon: '◉',
    label: 'Liberdade Financeira',
    title: 'Simule sua independência',
    desc: 'Defina capital alvo ou renda passiva desejada. Veja sua trajetória mês a mês e saiba quando vai chegar lá.',
  },
  {
    icon: '✦',
    label: 'Inteligência Artificial',
    title: 'Converse com seu portfólio',
    desc: 'Pergunte em linguagem natural: "Quanto investi em renda fixa?" ou "Qual meu maior gasto este mês?"',
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
    title: 'Veja o panorama completo',
    desc: 'Dashboard com patrimônio total, rentabilidade, alocação por classe e evolução histórica.',
  },
]

const FAQS = [
  {
    q: 'É gratuito?',
    a: 'Sim. O tracker está em beta e é totalmente gratuito. Crie sua conta e comece agora.',
  },
  {
    q: 'Meus dados são seguros?',
    a: 'Seus dados são armazenados com criptografia via Supabase (PostgreSQL com RLS). Nunca vendemos ou compartilhamos suas informações.',
  },
  {
    q: 'Quais tipos de investimento posso registrar?',
    a: 'Ações B3, ETFs, criptomoedas, renda fixa (CDB, Tesouro, LCI, LCA), FIIs, previdência, imóveis e ativos manuais com valor personalizado.',
  },
  {
    q: 'Funciona para quem mora fora do Brasil?',
    a: 'Sim. Criado por um brasileiro na França, para quem vive entre dois mundos. Suporte a BRL, EUR e USD com câmbio automático.',
  },
  {
    q: 'Posso importar meu extrato bancário?',
    a: 'Sim. Faça upload de um CSV e o sistema importa automaticamente suas transações para categorização e orçamento.',
  },
  {
    q: 'Tem app mobile?',
    a: 'O tracker é uma PWA — funciona no celular pelo navegador com experiência próxima de um app nativo.',
  },
]

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div style={{ background: BG, color: DARK, fontFamily: F_BODY, minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── HEADER ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(250,250,248,0.95)',
        backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          <a href="#hero" style={{ fontFamily: F_DISPLAY, fontSize: 20, fontWeight: 400, color: BLUE, textDecoration: 'none', letterSpacing: '-0.2px', flexShrink: 0 }}>
            André Gutto
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex" style={{ alignItems: 'center', gap: 36 }}>
            {[['#funcionalidades','Funcionalidades'],['#como-funciona','Como funciona'],['#faq','FAQ']].map(([href, label]) => (
              <a key={href} href={href} style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: GRAY, textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = DARK)}
                onMouseLeave={e => (e.currentTarget.style.color = GRAY)}
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex" style={{ alignItems: 'center', gap: 12 }}>
            <Link to="/login" style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, textDecoration: 'none' }}>
              Entrar
            </Link>
            <Link to="/login?mode=register" style={{
              fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              background: BLUE, color: '#fff', textDecoration: 'none',
              padding: '9px 20px', borderRadius: 3,
            }}>
              Começar grátis
            </Link>
          </div>

          {/* Mobile: hamburger only */}
          <button
            className="md:hidden"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: DARK, padding: 8, lineHeight: 0, marginRight: -8 }}
          >
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              }
            </svg>
          </button>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div style={{ background: BG, borderTop: `1px solid ${BORDER}`, padding: '8px 20px 20px' }} className="md:hidden">
            {[['#funcionalidades','Funcionalidades'],['#como-funciona','Como funciona'],['#faq','FAQ']].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}
                style={{ display: 'flex', alignItems: 'center', padding: '14px 0', fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: GRAY, textDecoration: 'none', borderBottom: `1px solid ${BORDER}` }}>
                {label}
              </a>
            ))}
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <Link to="/login" onClick={() => setMenuOpen(false)}
                style={{ flex: 1, textAlign: 'center', padding: '12px 0', fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 3 }}>
                Entrar
              </Link>
              <Link to="/login?mode=register" onClick={() => setMenuOpen(false)}
                style={{ flex: 1, textAlign: 'center', padding: '12px 0', fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: BLUE, color: '#fff', textDecoration: 'none', borderRadius: 3 }}>
                Começar grátis
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section id="hero" style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #080f1c 0%, #1B2F4E 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${PHOTO_URL}')`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.18 }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', background: 'linear-gradient(to top, rgba(6,12,24,0.90) 0%, transparent 100%)' }} />

        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '0 20px 80px', width: '100%' }}>
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD, flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
              Portfolio Tracker · Beta
            </span>
          </div>

          <h1 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(2.8rem, 7vw, 5.2rem)', fontWeight: 400, lineHeight: 1.06, color: '#fff', marginBottom: 24, letterSpacing: '-0.5px', maxWidth: 700 }}>
            Cultive o que<br />
            <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.45)' }}>verdadeiramente importa.</em>
          </h1>

          <p style={{ fontFamily: F_BODY, fontSize: 'clamp(15px, 2.2vw, 18px)', fontWeight: 300, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: 500, marginBottom: 40 }}>
            Portfólio de investimentos e controle financeiro reunidos. Multimoeda, com IA e pensado para quem vive entre países.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/login?mode=register" style={{
              fontFamily: F_MONO, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
              background: '#fff', color: DARK, textDecoration: 'none',
              padding: '15px 32px', borderRadius: 3,
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}>
              Criar conta grátis
            </Link>
            <Link to="/login" style={{
              fontFamily: F_MONO, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
              background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.8)', textDecoration: 'none',
              padding: '15px 32px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.18)',
            }}>
              Já tenho conta
            </Link>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '28px 24px' }}>
          {[
            { value: '6+',          label: 'Classes de ativos' },
            { value: 'BRL · EUR · USD', label: 'Moedas suportadas' },
            { value: '30+',         label: 'Conquistas desbloqueáveis' },
            { value: 'IA',          label: 'Assistente financeiro' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 400, color: BLUE, marginBottom: 6 }}>{s.value}</div>
              <div style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: GRAY, lineHeight: 1.4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FUNCIONALIDADES ── */}
      <section id="funcionalidades" style={{ padding: 'clamp(60px, 8vw, 100px) 20px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 56 }}>
          <p style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: GRAY, marginBottom: 14 }}>
            Funcionalidades
          </p>
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.9rem, 4vw, 2.8rem)', fontWeight: 400, lineHeight: 1.15, color: DARK, letterSpacing: '-0.3px', maxWidth: 540 }}>
            Tudo que você precisa para crescer com consciência
          </h2>
        </div>

        {/* 3-column grid — exactly 2 rows of 3, no orphans */}
        <div style={{ display: 'grid', gap: 1, background: BORDER }}
          className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: BG, padding: 'clamp(28px, 4vw, 40px) clamp(24px, 3vw, 36px)' }}>
              <div style={{ fontFamily: F_MONO, fontSize: 18, color: BLUE, marginBottom: 16, lineHeight: 1 }}>{f.icon}</div>
              <p style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: GRAY, marginBottom: 12 }}>
                {f.label}
              </p>
              <h3 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.05rem, 2vw, 1.3rem)', fontWeight: 400, color: DARK, marginBottom: 12, lineHeight: 1.25 }}>
                {f.title}
              </h3>
              <p style={{ fontFamily: F_BODY, fontSize: 14, fontWeight: 300, color: GRAY, lineHeight: 1.75 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section id="como-funciona" style={{ background: '#fff', borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: 'clamp(60px, 8vw, 100px) 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: 56 }}>
            <p style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: GRAY, marginBottom: 14 }}>
              Como funciona
            </p>
            <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.9rem, 4vw, 2.8rem)', fontWeight: 400, lineHeight: 1.15, color: DARK, letterSpacing: '-0.3px', maxWidth: 460 }}>
              Três passos para ter clareza total
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 40 }}>
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontFamily: F_MONO, fontSize: 28, fontWeight: 400, color: BORDER, letterSpacing: '-1px', lineHeight: 1 }}>{step.num}</span>
                  {i < HOW_IT_WORKS.length - 1 && (
                    <div style={{ flex: 1, height: 1, background: BORDER }} className="hidden lg:block" />
                  )}
                </div>
                <h3 style={{ fontFamily: F_DISPLAY, fontSize: '1.2rem', fontWeight: 400, color: DARK, lineHeight: 1.2 }}>{step.title}</h3>
                <p style={{ fontFamily: F_BODY, fontSize: 14, fontWeight: 300, color: GRAY, lineHeight: 1.75 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PHILOSOPHY STRIP ── */}
      <section style={{ background: BLUE, padding: 'clamp(60px, 8vw, 96px) 20px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: 32, height: 1, background: GOLD, margin: '0 auto 28px' }} />
          <p style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.4rem, 3.5vw, 2.2rem)', fontWeight: 400, fontStyle: 'italic', color: '#fff', lineHeight: 1.45, letterSpacing: '-0.2px' }}>
            "Construído por um brasileiro na França — para quem tem ativos em mais de um país e quer uma visão clara de tudo."
          </p>
          <div style={{ marginTop: 32 }}>
            <p style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
              André Gutto · Paris, France
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ padding: 'clamp(60px, 8vw, 100px) 20px', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ marginBottom: 52 }}>
          <p style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: GRAY, marginBottom: 14 }}>FAQ</p>
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.7rem, 3.5vw, 2.4rem)', fontWeight: 400, color: DARK, letterSpacing: '-0.3px' }}>
            Perguntas frequentes
          </h2>
        </div>

        <div>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '22px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 16,
                }}
              >
                <span style={{ fontFamily: F_BODY, fontSize: 'clamp(14px, 2vw, 16px)', fontWeight: 400, color: DARK, lineHeight: 1.4 }}>{faq.q}</span>
                <svg
                  width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={GRAY} strokeWidth={1.5}
                  style={{ flexShrink: 0, transition: 'transform 0.25s', transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openFaq === i && (
                <div style={{ paddingBottom: 22, fontFamily: F_BODY, fontSize: 15, fontWeight: 300, color: GRAY, lineHeight: 1.8 }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${BORDER}` }} />
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{ background: DARK, padding: 'clamp(60px, 8vw, 100px) 20px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: 32, height: 1, background: GOLD, margin: '0 auto 28px' }} />
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(2rem, 4.5vw, 3rem)', fontWeight: 400, lineHeight: 1.12, color: '#fff', letterSpacing: '-0.4px', marginBottom: 16 }}>
            Pronto para cultivar seu patrimônio?
          </h2>
          <p style={{ fontFamily: F_BODY, fontSize: 15, fontWeight: 300, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 36 }}>
            Crie sua conta em menos de dois minutos. Sem cartão de crédito. Grátis para sempre no beta.
          </p>
          <Link to="/login?mode=register" style={{
            display: 'inline-block',
            fontFamily: F_MONO, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
            background: '#fff', color: DARK, textDecoration: 'none',
            padding: '15px 36px', borderRadius: 3,
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          }}>
            Começar agora
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid rgba(255,255,255,0.07)`, background: DARK, padding: '24px 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <a href="https://andregutto.com" target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: F_DISPLAY, fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>
            André Gutto
          </a>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            {[['Portfolio Tracker', null],['/privacy','Privacidade'],['/terms','Termos'],['/login','Entrar']].map((item, i) =>
              item[1] === null ? (
                <span key={i} style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>
                  {item[0]}
                </span>
              ) : (
                <Link key={item[0] as string} to={item[0] as string} style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>
                  {item[1]}
                </Link>
              )
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
