import { useState } from 'react'
import { Link } from 'react-router-dom'

const BLUE    = '#1B2F4E'
const BG      = '#FAFAF8'
const DARK    = '#111110'
const GRAY    = '#6B6B67'
const BORDER  = '#E0DDD5'

const F_DISPLAY = "'Playfair Display', serif"
const F_MONO    = "'DM Mono', monospace"
const F_BODY    = "'DM Sans', sans-serif"

const PHOTO_URL = 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1800&q=80'

const FEATURES = [
  {
    label: 'Portfólio',
    title: 'Todos os seus ativos, um único lugar',
    desc: 'Ações B3, ETFs, criptos, renda fixa, imóveis e FIIs — com cotações ao vivo e histórico de performance.',
  },
  {
    label: 'Multimoeda',
    title: 'Invista sem fronteiras',
    desc: 'Gerencie ativos em BRL, EUR e USD. Patrimônio consolidado na moeda que preferir, câmbio automático.',
  },
  {
    label: 'Finanças',
    title: 'Controle do que entra e sai',
    desc: 'Importe extratos, categorize gastos, crie orçamentos por envelope e veja para onde vai seu dinheiro.',
  },
  {
    label: 'Inteligência Artificial',
    title: 'Converse com seu portfólio',
    desc: 'Pergunte em linguagem natural: "Quanto investi em renda fixa?" ou "Qual meu maior gasto este mês?"',
  },
  {
    label: 'Conquistas',
    title: 'Sua jornada tem marcos',
    desc: 'Medalhas e XP a cada avanço — da primeira semente ao clube do milhão. Invista com propósito.',
  },
  {
    label: 'Imposto de Renda',
    title: 'Relatórios prontos para declarar',
    desc: 'Ganhos e perdas de capital calculados automaticamente por operação. Menos dor de cabeça no IR.',
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
    <div style={{ background: BG, color: DARK, fontFamily: F_BODY, minHeight: '100vh' }}>

      {/* ── HEADER ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(250,250,248,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          <a href="#hero" style={{ fontFamily: F_DISPLAY, fontSize: 19, fontWeight: 400, color: BLUE, textDecoration: 'none', letterSpacing: '-0.2px' }}>
            André Gutto
          </a>

          {/* Desktop nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="hidden sm:flex">
            {[['#funcionalidades','Funcionalidades'],['#faq','FAQ']].map(([href, label]) => (
              <a key={href} href={href} style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: GRAY, textDecoration: 'none' }}>
                {label}
              </a>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link to="/login" className="hidden sm:block" style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, textDecoration: 'none' }}>
              Entrar
            </Link>
            <Link to="/login?mode=register" style={{
              fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
              background: BLUE, color: '#fff', textDecoration: 'none',
              padding: '9px 18px', borderRadius: 3,
            }}>
              Começar
            </Link>
            {/* Mobile menu */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="sm:hidden"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: BLUE, padding: 4, lineHeight: 0 }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                {menuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                }
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div style={{ background: BG, borderTop: `1px solid ${BORDER}`, padding: '12px 24px 16px' }}>
            {[['#funcionalidades','Funcionalidades'],['#faq','FAQ']].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '10px 0', fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: GRAY, textDecoration: 'none', borderBottom: `1px solid ${BORDER}` }}>
                {label}
              </a>
            ))}
            <Link to="/login" onClick={() => setMenuOpen(false)}
              style={{ display: 'block', padding: '12px 0 0', fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: BLUE, textDecoration: 'none' }}>
              Entrar
            </Link>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section id="hero" style={{ position: 'relative', minHeight: '92vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        {/* Photo */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${PHOTO_URL}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        {/* Overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #0c1a2e 0%, #1B2F4E 80%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${PHOTO_URL}')`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.22 }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', background: 'linear-gradient(to top, rgba(8,16,32,0.85) 0%, transparent 100%)' }} />

        {/* Content */}
        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '0 24px 80px', width: '100%' }}>
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#C9A227', flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
              Portfolio Tracker · Beta
            </span>
          </div>

          <h1 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(2.4rem, 6vw, 4.2rem)', fontWeight: 400, lineHeight: 1.08, color: '#fff', marginBottom: 20, letterSpacing: '-0.5px', maxWidth: 680 }}>
            Cultive o que<br />
            <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.5)' }}>verdadeiramente importa.</em>
          </h1>

          <p style={{ fontFamily: F_BODY, fontSize: 16, fontWeight: 300, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65, maxWidth: 480, marginBottom: 36 }}>
            Portfólio de investimentos e controle financeiro reunidos. Multimoeda, com IA e pensado para quem vive entre países.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/login?mode=register" style={{
              fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
              background: '#fff', color: DARK, textDecoration: 'none',
              padding: '14px 28px', borderRadius: 3,
            }}>
              Criar conta grátis
            </Link>
            <Link to="/login" style={{
              fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
              background: 'rgba(255,255,255,0.08)', color: '#fff', textDecoration: 'none',
              padding: '14px 28px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.2)',
            }}>
              Já tenho conta
            </Link>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px', display: 'flex', gap: 48, flexWrap: 'wrap' }}>
          {[
            { value: '6+',  label: 'Classes de ativos' },
            { value: 'BRL · EUR · USD', label: 'Moedas suportadas' },
            { value: '30+', label: 'Conquistas para desbloquear' },
            { value: 'IA', label: 'Assistente financeiro integrado' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: F_DISPLAY, fontSize: '1.4rem', fontWeight: 400, color: BLUE }}>{s.value}</span>
              <span style={{ fontFamily: F_MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: GRAY }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── FUNCIONALIDADES ── */}
      <section id="funcionalidades" style={{ padding: '96px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 64 }}>
          <p style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: GRAY, marginBottom: 12 }}>
            Funcionalidades
          </p>
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 400, lineHeight: 1.15, color: DARK, letterSpacing: '-0.3px', maxWidth: 520 }}>
            Tudo que você precisa para crescer com consciência
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1, background: BORDER }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: BG, padding: '36px 32px' }}>
              <p style={{ fontFamily: F_MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: GRAY, marginBottom: 16 }}>
                {f.label}
              </p>
              <h3 style={{ fontFamily: F_DISPLAY, fontSize: '1.15rem', fontWeight: 400, color: DARK, marginBottom: 12, lineHeight: 1.25 }}>
                {f.title}
              </h3>
              <p style={{ fontFamily: F_BODY, fontSize: 13, fontWeight: 300, color: GRAY, lineHeight: 1.7 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PHILOSOPHY STRIP ── */}
      <section style={{ background: BLUE, padding: '80px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontFamily: F_MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>
            Feito por quem vive entre dois mundos
          </p>
          <p style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.4rem, 3.5vw, 2rem)', fontWeight: 400, fontStyle: 'italic', color: '#fff', lineHeight: 1.4, letterSpacing: '-0.2px' }}>
            "Construído por um brasileiro na França — para quem tem ativos em mais de um país e quer uma visão clara de tudo."
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ padding: '96px 24px', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 48 }}>
          <p style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: GRAY, marginBottom: 12 }}>FAQ</p>
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 400, color: DARK, letterSpacing: '-0.3px' }}>
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
                  padding: '20px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 16,
                }}
              >
                <span style={{ fontFamily: F_BODY, fontSize: 15, fontWeight: 400, color: DARK, lineHeight: 1.4 }}>{faq.q}</span>
                <svg
                  width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={GRAY} strokeWidth={1.5}
                  style={{ flexShrink: 0, transition: 'transform 0.2s', transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openFaq === i && (
                <div style={{ paddingBottom: 20, fontFamily: F_BODY, fontSize: 14, fontWeight: 300, color: GRAY, lineHeight: 1.75 }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${BORDER}` }} />
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{ background: '#fff', borderTop: `1px solid ${BORDER}`, padding: '80px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontFamily: F_MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: GRAY, marginBottom: 20 }}>
            Acesso gratuito · Beta
          </p>
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 'clamp(1.8rem, 4vw, 2.4rem)', fontWeight: 400, lineHeight: 1.15, color: DARK, letterSpacing: '-0.3px', marginBottom: 12 }}>
            Pronto para cultivar seu patrimônio?
          </h2>
          <p style={{ fontFamily: F_BODY, fontSize: 14, fontWeight: 300, color: GRAY, lineHeight: 1.7, marginBottom: 32 }}>
            Crie sua conta em menos de dois minutos. Sem cartão de crédito.
          </p>
          <Link to="/login?mode=register" style={{
            display: 'inline-block',
            fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
            background: BLUE, color: '#fff', textDecoration: 'none',
            padding: '14px 32px', borderRadius: 3,
          }}>
            Começar agora
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid ${BORDER}`, padding: '24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, maxWidth: 1200, margin: '0 auto' }}>
        <a href="https://andregutto.com" target="_blank" rel="noopener noreferrer"
          style={{ fontFamily: F_DISPLAY, fontSize: 15, fontWeight: 400, color: BLUE, textDecoration: 'none' }}>
          André Gutto
        </a>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          {[['Portfolio Tracker', null],['·', null],['/privacy','Privacidade'],['/terms','Termos'],['/login','Entrar']].map((item, i) =>
            item[1] === null ? (
              <span key={i} style={{ fontFamily: F_MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: GRAY }}>
                {item[0] === '·' ? item[0] : item[0]}
              </span>
            ) : (
              <Link key={item[0] as string} to={item[0] as string} style={{ fontFamily: F_MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: GRAY, textDecoration: 'none' }}>
                {item[1]}
              </Link>
            )
          )}
        </div>
      </footer>
    </div>
  )
}
