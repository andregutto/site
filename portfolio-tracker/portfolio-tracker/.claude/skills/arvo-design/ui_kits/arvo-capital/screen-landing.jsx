/* ============================================================
   Arvo — Landing
   Marketing hero (black + gold) on top of broto photo
   + verticals + how-it-works + CTA into login
   ============================================================ */

const landingStyles = {
  page: {
    background: 'var(--arvo-black)',
    color: 'var(--arvo-fg-on-dark)',
    minHeight: '100vh',
    fontFamily: "'Tenor Sans', sans-serif",
  },
  hero: {
    position: 'relative',
    minHeight: '94vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 32px',
    overflow: 'hidden',
    textAlign: 'center',
  },
  heroBg: {
    position: 'absolute', inset: 0,
    backgroundImage: "url('../../assets/imagery/01-broto-floresta.jpg')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: 'brightness(0.30) sepia(0.35) saturate(1.15)',
  },
  heroOverlay: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(to bottom, rgba(13,13,13,0.35) 0%, rgba(13,13,13,0.70) 60%, rgba(13,13,13,1) 100%)',
  },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    padding: '24px 36px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    zIndex: 5,
  },
  topWm: {
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 14, letterSpacing: '0.30em', textIndent: '0.30em',
    color: 'var(--arvo-offwhite)', display: 'flex', alignItems: 'center', gap: 10,
  },
  topRight: { display: 'flex', alignItems: 'center', gap: 18 },
  topLink: {
    fontFamily: "'Tenor Sans', sans-serif", fontSize: 11,
    letterSpacing: '0.18em', textTransform: 'uppercase',
    color: 'rgba(242,237,228,0.65)',
    background: 'transparent', border: 0, cursor: 'pointer',
  },
  heroContent: { position: 'relative', zIndex: 2, maxWidth: 720 },
  eyebrow: {
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 10, letterSpacing: '0.40em', textTransform: 'uppercase',
    color: 'var(--arvo-gold)', opacity: 0.7, marginBottom: 36,
  },
  wordmark: {
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 'clamp(72px, 13vw, 140px)',
    letterSpacing: '0.28em', textIndent: '0.28em',
    color: 'var(--arvo-offwhite)', lineHeight: 1, marginBottom: 22,
  },
  tagline: {
    fontFamily: "'Playfair Display', serif", fontStyle: 'italic',
    fontSize: 'clamp(14px, 2vw, 20px)',
    color: 'var(--arvo-gold)', letterSpacing: '0.06em', opacity: 0.92,
  },
  rule: { width: 80, height: 1, background: 'linear-gradient(to right, transparent, var(--arvo-gold), transparent)', margin: '36px auto 28px' },
  ctaRow: { display: 'flex', gap: 12, justifyContent: 'center', marginTop: 4, alignItems: 'center', flexWrap: 'wrap' },
  stat: { display: 'inline-flex', alignItems: 'center', gap: 10, marginLeft: 18, paddingLeft: 18, borderLeft: '1px solid rgba(200,184,154,0.20)' },
  statNum: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 14, letterSpacing: '0.10em', color: 'var(--arvo-offwhite)' },
  statLab: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'rgba(200,184,154,0.55)' },

  section: { maxWidth: 1080, margin: '0 auto', padding: '96px 40px' },
  sectionRule: { borderTop: '1px solid rgba(200,184,154,0.10)' },
  h2: {
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 'clamp(28px, 3vw, 40px)',
    letterSpacing: '0.10em', lineHeight: 1.2,
    color: 'var(--arvo-offwhite)', maxWidth: 600, marginTop: 22, textWrap: 'balance',
  },
  h2Sub: {
    fontFamily: "'Playfair Display', serif", fontStyle: 'italic',
    fontSize: 16, color: 'var(--arvo-gold)', opacity: 0.85, marginTop: 14,
    maxWidth: 540,
  },

  vGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 56 },
  vCard: {
    background: '#161513',
    border: '1px solid rgba(200,184,154,0.10)',
    borderRadius: 14, padding: 28,
    position: 'relative', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    minHeight: 280,
  },
  vAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  vGlow: { position: 'absolute', top: -80, left: '40%', width: 200, height: 200, borderRadius: '50%', opacity: 0.10, filter: 'blur(50px)' },
  vIcon: {
    position: 'absolute', top: 22, right: 22,
    width: 36, height: 36, borderRadius: 10,
    fontFamily: "'Tenor Sans', sans-serif", fontSize: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  vTag: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', marginBottom: 6 },
  vName: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 26, letterSpacing: '0.10em', color: 'var(--arvo-offwhite)', lineHeight: 1.1, marginBottom: 4 },
  vSub: { fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 12, color: 'rgba(242,237,228,0.45)', marginBottom: 16 },
  vTags: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  vPill: (color) => ({
    fontFamily: "'Tenor Sans', sans-serif", fontSize: 9, letterSpacing: '0.06em',
    padding: '3px 9px', borderRadius: 999, border: '1px solid ' + color + '55',
    color, opacity: 0.85,
  }),

  steps: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 56 },
  stepCard: { padding: '4px 0' },
  stepNum: {
    fontFamily: "'Tenor Sans', sans-serif", fontSize: 14, letterSpacing: '0.30em',
    color: 'var(--arvo-gold)', marginBottom: 18,
  },
  stepTitle: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 20, letterSpacing: '0.05em', color: 'var(--arvo-offwhite)', marginBottom: 10 },
  stepDesc: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 13, lineHeight: 1.75, color: 'rgba(242,237,228,0.55)', maxWidth: 280 },

  footer: { borderTop: '1px solid rgba(200,184,154,0.08)', padding: '40px 36px', textAlign: 'center' },
};

const VERTICALS = [
  { tag: 'Arvo', name: 'Capital',  sub: 'finanças & patrimônio',     accent: '#1B4FD8', glyph: '⬡', tags: ['gráfico', 'saldo', 'aporte'] },
  { tag: 'Arvo', name: 'Voyage',   sub: 'estilo de vida & viagens',  accent: '#D63B2F', glyph: '◈', tags: ['destino', 'reserva', 'mapa'] },
  { tag: 'Arvo', name: 'Journal',  sub: 'comunidade & evolução',     accent: '#E8A020', glyph: '◎', tags: ['live', 'fórum', 'planner'] },
];

const STEPS = [
  { n: '01', t: 'Crie sua conta',          d: 'Cadastro em dois minutos. Escolha sua moeda principal e configure as classes.' },
  { n: '02', t: 'Adicione seus ativos',    d: 'Ações, FIIs, cripto, renda fixa, imóveis. Cotações automáticas via B3, Yahoo e CoinGecko.' },
  { n: '03', t: 'Veja o panorama inteiro', d: 'Dashboard com patrimônio, rentabilidade, alocação por classe e evolução histórica.' },
];

const LandingScreen = ({ onEnter }) => (
  <div style={landingStyles.page}>
    <div style={landingStyles.hero}>
      <div style={landingStyles.heroBg} />
      <div style={landingStyles.heroOverlay} />
      <div className="arvo-grain" />
      <div style={landingStyles.topBar}>
        <div style={landingStyles.topWm}>
          <img src="../../assets/logo/arvo-symbol-gold.svg" width="22" height="23" alt="" />
          arvo
        </div>
        <div style={landingStyles.topRight}>
          <button style={landingStyles.topLink}>Manifesto</button>
          <button style={landingStyles.topLink}>Verticais</button>
          <Button variant="ghostDark" onClick={onEnter} style={{ padding: '9px 18px', fontSize: 11 }}>Entrar</Button>
        </div>
      </div>
      <div style={landingStyles.heroContent}>
        <div style={landingStyles.eyebrow}>Patrimônio para brasileiros na Europa</div>
        <h1 style={landingStyles.wordmark}>arvo</h1>
        <p style={landingStyles.tagline}>cultive o que é seu</p>
        <div style={landingStyles.rule} />
        <div style={landingStyles.ctaRow}>
          <Button variant="gold" onClick={onEnter} style={{ fontSize: 11, padding: '10px 18px', letterSpacing: '0.14em' }}>Começar agora</Button>
          <Button variant="ghostDark" onClick={onEnter} style={{ fontSize: 11, padding: '10px 18px', letterSpacing: '0.14em' }}>Já tenho conta</Button>
          <div style={landingStyles.stat}>
            <div>
              <div style={landingStyles.statNum}>BRL · EUR · USD</div>
              <div style={landingStyles.statLab}>multimoeda nativo</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <section style={landingStyles.section}>
      <Eyebrow>Arquitetura de Verticais</Eyebrow>
      <h2 style={landingStyles.h2}>uma raiz. três frentes.</h2>
      <p style={landingStyles.h2Sub}>a marca-mãe assina tudo em preto e dourado. cada vertical tem uma cor — só nos dados, nas ações e nas tags.</p>
      <div style={landingStyles.vGrid}>
        {VERTICALS.map(v => (
          <div key={v.name} style={landingStyles.vCard}>
            <div style={{ ...landingStyles.vAccent, background: `linear-gradient(to right, ${v.accent}, transparent)` }} />
            <div style={{ ...landingStyles.vGlow, background: v.accent }} />
            <div style={{ ...landingStyles.vIcon, background: v.accent + '22', color: v.accent }}>{v.glyph}</div>
            <div>
              <div style={{ ...landingStyles.vTag, color: v.accent }}>{v.tag}</div>
              <div style={landingStyles.vName}>{v.name}</div>
              <div style={landingStyles.vSub}>{v.sub}</div>
              <div style={landingStyles.vTags}>
                {v.tags.map(t => <span key={t} style={landingStyles.vPill(v.accent)}>{t}</span>)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>

    <section style={{ ...landingStyles.section, ...landingStyles.sectionRule }}>
      <Eyebrow>Como funciona</Eyebrow>
      <h2 style={landingStyles.h2}>devagar, mas em frente.</h2>
      <div style={landingStyles.steps}>
        {STEPS.map(s => (
          <div key={s.n} style={landingStyles.stepCard}>
            <div style={landingStyles.stepNum}>{s.n}</div>
            <div style={landingStyles.stepTitle}>{s.t}</div>
            <div style={landingStyles.stepDesc}>{s.d}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 56, display: 'flex', justifyContent: 'center' }}>
        <Button variant="gold" onClick={onEnter}>Plantar a primeira semente</Button>
      </div>
    </section>

    <footer style={landingStyles.footer}>
      <img src="../../assets/logo/arvo-symbol-gold.svg" width="22" height="23" alt="" style={{ opacity: 0.4, marginBottom: 12 }} />
      <p style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(200,184,154,0.30)' }}>
        arvo — cultive o que é seu — 2026
      </p>
    </footer>
  </div>
);

Object.assign(window, { LandingScreen });
