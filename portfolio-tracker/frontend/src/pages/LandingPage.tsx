import { Link } from 'react-router-dom'

const PHOTO_URL = '/brand/imagery/01-broto-floresta.jpg'

const VERTICALS = [
  { tag: 'Arvo', name: 'Capital',  sub: 'finanças & patrimônio',    accent: '#1B4FD8', glyph: '⬡', tags: ['gráfico', 'saldo', 'aporte'] },
  { tag: 'Arvo', name: 'Voyage',   sub: 'estilo de vida & viagens', accent: '#D63B2F', glyph: '◈', tags: ['destino', 'reserva', 'mapa'] },
  { tag: 'Arvo', name: 'Journal',  sub: 'comunidade & evolução',    accent: '#E8A020', glyph: '◎', tags: ['live', 'fórum', 'planner'] },
]

const STEPS = [
  { n: '01', t: 'Crie sua conta',          d: 'Cadastro em dois minutos. Escolha sua moeda principal e configure as classes.' },
  { n: '02', t: 'Adicione seus ativos',    d: 'Ações, FIIs, cripto, renda fixa, imóveis. Cotações automáticas via B3, Yahoo e CoinGecko.' },
  { n: '03', t: 'Veja o panorama inteiro', d: 'Dashboard com patrimônio, rentabilidade, alocação por classe e evolução histórica.' },
]

const F_SANS    = "'Tenor Sans', sans-serif"
const F_DISPLAY = "'Playfair Display', serif"

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(200,184,154,0.40)', margin: 0 }}>
      {children}
    </p>
  )
}

export default function LandingPage() {
  return (
    <div style={{ background: 'var(--arvo-black)', color: 'var(--arvo-fg-on-dark)', minHeight: '100vh', fontFamily: F_SANS }}>

      {/* ── HERO ── */}
      <div style={{ position: 'relative', minHeight: '94vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 32px', overflow: 'hidden', textAlign: 'center' }}>

        {/* Photo bg */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${PHOTO_URL}')`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'brightness(0.30) sepia(0.35) saturate(1.15)' }} />
        {/* Gradient overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(13,13,13,0.35) 0%, rgba(13,13,13,0.70) 60%, rgba(13,13,13,1) 100%)' }} />
        {/* Grain */}
        <div className="arvo-grain" />

        {/* Top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '24px 36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 5 }}>
          <div style={{ fontFamily: F_SANS, fontSize: 14, letterSpacing: '0.30em', textIndent: '0.30em', color: 'var(--arvo-offwhite)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/brand/logo/arvo-symbol-gold.svg" width="22" height="23" alt="" />
            arvo
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <button style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(242,237,228,0.65)', background: 'transparent', border: 0, cursor: 'pointer' }}>
              Manifesto
            </button>
            <button style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(242,237,228,0.65)', background: 'transparent', border: 0, cursor: 'pointer' }}>
              Verticais
            </button>
            <Link to="/login" style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-offwhite)', textDecoration: 'none', padding: '9px 18px', border: '1px solid rgba(200,184,154,0.30)', borderRadius: 3 }}>
              Entrar
            </Link>
          </div>
        </div>

        {/* Hero content */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 720 }}>
          <div style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.40em', textTransform: 'uppercase', color: 'var(--arvo-gold)', opacity: 0.7, marginBottom: 36 }}>
            Patrimônio para brasileiros na Europa
          </div>
          <h1 style={{ fontFamily: F_SANS, fontSize: 'clamp(72px, 13vw, 140px)', letterSpacing: '0.28em', textIndent: '0.28em', color: 'var(--arvo-offwhite)', lineHeight: 1, marginBottom: 22 }}>
            arvo
          </h1>
          <p style={{ fontFamily: F_DISPLAY, fontStyle: 'italic', fontSize: 'clamp(14px, 2vw, 20px)', color: 'var(--arvo-gold)', letterSpacing: '0.06em', opacity: 0.92, margin: 0 }}>
            cultive o que é seu
          </p>
          <div style={{ width: 80, height: 1, background: 'linear-gradient(to right, transparent, var(--arvo-gold), transparent)', margin: '36px auto 28px' }} />
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to="/login?mode=register" style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', background: 'var(--arvo-gold)', color: 'var(--arvo-black)', textDecoration: 'none', padding: '10px 18px', borderRadius: 3 }}>
              Começar agora
            </Link>
            <Link to="/login" style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-offwhite)', textDecoration: 'none', padding: '10px 18px', border: '1px solid rgba(200,184,154,0.30)', borderRadius: 3 }}>
              Já tenho conta
            </Link>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginLeft: 18, paddingLeft: 18, borderLeft: '1px solid rgba(200,184,154,0.20)' }}>
              <div>
                <div style={{ fontFamily: F_SANS, fontSize: 14, letterSpacing: '0.10em', color: 'var(--arvo-offwhite)' }}>BRL · EUR · USD</div>
                <div style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'rgba(200,184,154,0.55)' }}>multimoeda nativo</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── VERTICALS ── */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '96px 40px' }}>
        <Eyebrow>Arquitetura de Verticais</Eyebrow>
        <h2 style={{ fontFamily: F_SANS, fontSize: 'clamp(28px, 3vw, 40px)', letterSpacing: '0.10em', lineHeight: 1.2, color: 'var(--arvo-offwhite)', maxWidth: 600, marginTop: 22, textWrap: 'balance' as never }}>
          uma raiz. três frentes.
        </h2>
        <p style={{ fontFamily: F_DISPLAY, fontStyle: 'italic', fontSize: 16, color: 'var(--arvo-gold)', opacity: 0.85, marginTop: 14, maxWidth: 540 }}>
          a marca-mãe assina tudo em preto e dourado. cada vertical tem uma cor — só nos dados, nas ações e nas tags.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 56 }} className="grid-cols-1 sm:grid-cols-3">
          {VERTICALS.map(v => (
            <div key={v.name} style={{ background: '#161513', border: '1px solid rgba(200,184,154,0.10)', borderRadius: 14, padding: 28, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 280 }}>
              {/* Accent top border */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right, ${v.accent}, transparent)` }} />
              {/* Glow */}
              <div style={{ position: 'absolute', top: -80, left: '40%', width: 200, height: 200, borderRadius: '50%', background: v.accent, opacity: 0.10, filter: 'blur(50px)' }} />
              {/* Icon */}
              <div style={{ position: 'absolute', top: 22, right: 22, width: 36, height: 36, borderRadius: 10, background: v.accent + '22', color: v.accent, fontFamily: F_SANS, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {v.glyph}
              </div>
              <div>
                <div style={{ fontFamily: F_SANS, fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', marginBottom: 6, color: v.accent }}>{v.tag}</div>
                <div style={{ fontFamily: F_SANS, fontSize: 26, letterSpacing: '0.10em', color: 'var(--arvo-offwhite)', lineHeight: 1.1, marginBottom: 4 }}>{v.name}</div>
                <div style={{ fontFamily: F_DISPLAY, fontStyle: 'italic', fontSize: 12, color: 'rgba(242,237,228,0.45)', marginBottom: 16 }}>{v.sub}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {v.tags.map(tag => (
                    <span key={tag} style={{ fontFamily: F_SANS, fontSize: 9, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 999, border: `1px solid ${v.accent}55`, color: v.accent, opacity: 0.85 }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '96px 40px', borderTop: '1px solid rgba(200,184,154,0.10)' }}>
        <Eyebrow>Como funciona</Eyebrow>
        <h2 style={{ fontFamily: F_SANS, fontSize: 'clamp(28px, 3vw, 40px)', letterSpacing: '0.10em', lineHeight: 1.2, color: 'var(--arvo-offwhite)', maxWidth: 600, marginTop: 22, textWrap: 'balance' as never }}>
          devagar, mas em frente.
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 56 }} className="grid-cols-1 sm:grid-cols-3">
          {STEPS.map(s => (
            <div key={s.n} style={{ padding: '4px 0' }}>
              <div style={{ fontFamily: F_SANS, fontSize: 14, letterSpacing: '0.30em', color: 'var(--arvo-gold)', marginBottom: 18 }}>{s.n}</div>
              <div style={{ fontFamily: F_SANS, fontSize: 20, letterSpacing: '0.05em', color: 'var(--arvo-offwhite)', marginBottom: 10 }}>{s.t}</div>
              <div style={{ fontFamily: F_SANS, fontSize: 13, lineHeight: 1.75, color: 'rgba(242,237,228,0.55)', maxWidth: 280 }}>{s.d}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 56, display: 'flex', justifyContent: 'center' }}>
          <Link to="/login?mode=register" style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', background: 'var(--arvo-gold)', color: 'var(--arvo-black)', textDecoration: 'none', padding: '12px 24px', borderRadius: 3 }}>
            Plantar a primeira semente
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid rgba(200,184,154,0.08)', padding: '40px 36px', textAlign: 'center' }}>
        <img src="/brand/logo/arvo-symbol-gold.svg" width="22" height="23" alt="" style={{ opacity: 0.4, marginBottom: 12 }} />
        <p style={{ fontFamily: F_SANS, fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(200,184,154,0.30)', margin: 0 }}>
          arvo — cultive o que é seu — 2026
        </p>
      </footer>
    </div>
  )
}
