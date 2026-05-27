/* ============================================================
   Arvo Capital — Login
   Editorial sign-in, off-white surface, gold focus rings
   ============================================================ */

const loginStyles = {
  page: {
    minHeight: '100vh',
    background: 'var(--arvo-offwhite)',
    display: 'grid',
    gridTemplateColumns: '1fr 1.1fr',
    fontFamily: "'Tenor Sans', sans-serif",
  },
  left: {
    background: 'var(--arvo-black)',
    color: 'var(--arvo-fg-on-dark)',
    padding: '64px 56px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },
  leftBg: {
    position: 'absolute', inset: 0,
    backgroundImage: "url('../../assets/imagery/03-capins-dourados.jpg')",
    backgroundSize: 'cover', backgroundPosition: 'center',
    filter: 'brightness(0.30) sepia(0.40) saturate(1.20)',
  },
  leftOverlay: { position: 'absolute', inset: 0, background: 'linear-gradient(to bottom right, rgba(13,13,13,0.55), rgba(13,13,13,0.92))' },
  leftContent: { position: 'relative', zIndex: 2 },
  wm: {
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 20, letterSpacing: '0.30em', textIndent: '0.30em',
    color: 'var(--arvo-offwhite)', display: 'flex', alignItems: 'center', gap: 12,
  },
  quote: {
    fontFamily: "'Playfair Display', serif", fontStyle: 'italic',
    fontSize: 36, lineHeight: 1.2, color: 'var(--arvo-gold)',
    maxWidth: 380, marginTop: 60,
  },
  cite: {
    fontFamily: "'Tenor Sans', sans-serif", fontSize: 10,
    letterSpacing: '0.30em', textTransform: 'uppercase',
    color: 'rgba(242,237,228,0.45)', marginTop: 24,
  },
  bottom: {
    fontFamily: "'Tenor Sans', sans-serif", fontSize: 11,
    letterSpacing: '0.18em', color: 'rgba(242,237,228,0.5)',
    position: 'relative', zIndex: 2,
  },

  right: {
    padding: '64px 72px',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
  },
  topRight: { display: 'flex', justifyContent: 'flex-end', gap: 14, marginBottom: 40 },
  langBtn: (active) => ({
    fontFamily: "'Tenor Sans', sans-serif", fontSize: 10,
    letterSpacing: '0.18em', textTransform: 'uppercase',
    padding: '6px 10px', border: 0, background: 'transparent',
    color: active ? 'var(--arvo-black)' : 'rgba(13,13,13,0.4)',
    cursor: 'pointer',
    borderBottom: active ? '1px solid var(--arvo-black)' : '1px solid transparent',
  }),
  eyebrow: {
    fontFamily: "'Tenor Sans', sans-serif", fontSize: 10,
    letterSpacing: '0.30em', textTransform: 'uppercase',
    color: 'var(--arvo-fg-soft)', marginBottom: 16,
  },
  h1: {
    fontFamily: "'Tenor Sans', sans-serif", fontSize: 44,
    letterSpacing: '0.06em', lineHeight: 1.15,
    color: 'var(--arvo-fg)', marginBottom: 12, maxWidth: 460,
  },
  sub: {
    fontFamily: "'Playfair Display', serif", fontStyle: 'italic',
    fontSize: 17, color: 'var(--arvo-terracotta)', marginBottom: 40,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 440 },
  modeRow: { display: 'flex', gap: 18, marginBottom: 8 },
  modeBtn: (active) => ({
    fontFamily: "'Tenor Sans', sans-serif", fontSize: 11,
    letterSpacing: '0.18em', textTransform: 'uppercase',
    padding: '4px 0', border: 0, background: 'transparent',
    color: active ? 'var(--arvo-black)' : 'rgba(13,13,13,0.35)',
    borderBottom: active ? '1px solid var(--arvo-black)' : '1px solid transparent',
    cursor: 'pointer',
  }),
  helper: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  forgot: {
    fontFamily: "'Tenor Sans', sans-serif", fontSize: 11,
    letterSpacing: '0.10em', color: 'var(--arvo-fg-soft)',
    background: 'transparent', border: 0, cursor: 'pointer',
  },
  legal: {
    fontFamily: "'Tenor Sans', sans-serif", fontSize: 11,
    letterSpacing: '0.05em', color: 'var(--arvo-fg-soft)',
    marginTop: 32, maxWidth: 440, lineHeight: 1.7,
  },
};

const LoginScreen = ({ onLogin, onBack }) => {
  const [mode, setMode] = React.useState('login');
  const [email, setEmail] = React.useState('andre@arvo.cc');
  const [pw, setPw]       = React.useState('••••••••');
  const [lang, setLang]   = React.useState('PT');

  const submit = (e) => { e.preventDefault(); onLogin(); };

  return (
    <div style={loginStyles.page}>
      {/* Left — editorial side */}
      <aside style={loginStyles.left}>
        <div style={loginStyles.leftBg} />
        <div style={loginStyles.leftOverlay} />
        <div className="arvo-grain" />
        <div style={loginStyles.leftContent}>
          <a style={loginStyles.wm} onClick={onBack}>
            <img src="../../assets/logo/arvo-symbol-gold.svg" width="24" height="25" alt="" />
            arvo
          </a>
          <div style={loginStyles.quote}>
            "o pequeno que vai se tornar grande."
          </div>
          <div style={loginStyles.cite}>— manifesto, 2026</div>
        </div>
        <div style={loginStyles.bottom}>cultive o que é seu</div>
      </aside>

      {/* Right — form */}
      <main style={loginStyles.right}>
        <div style={loginStyles.topRight}>
          {['PT', 'EN', 'FR'].map(l => (
            <button key={l} style={loginStyles.langBtn(lang === l)} onClick={() => setLang(l)}>{l}</button>
          ))}
        </div>

        <div style={loginStyles.eyebrow}>Acesso</div>
        <h1 style={loginStyles.h1}>bem-vindo de volta.</h1>
        <p style={loginStyles.sub}>continue de onde parou.</p>

        <form style={loginStyles.form} onSubmit={submit}>
          <div style={loginStyles.modeRow}>
            <button type="button" style={loginStyles.modeBtn(mode === 'login')}    onClick={() => setMode('login')}>Entrar</button>
            <button type="button" style={loginStyles.modeBtn(mode === 'register')} onClick={() => setMode('register')}>Criar conta</button>
          </div>

          {mode === 'register' && (
            <div>
              <Label>Nome</Label>
              <Input placeholder="André Gutto" />
            </div>
          )}
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Senha</Label>
            <Input type="password" value={pw} onChange={e => setPw(e.target.value)} />
            <div style={loginStyles.helper}>
              <span style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 11, color: 'var(--arvo-fg-soft)' }}>8 caracteres no mínimo</span>
              <button type="button" style={loginStyles.forgot}>esqueci a senha</button>
            </div>
          </div>
          {mode === 'register' && (
            <div>
              <Label>Moeda principal</Label>
              <Segmented options={['BRL', 'USD', 'EUR']} value="EUR" onChange={() => {}} />
            </div>
          )}
          <Button variant="primary" type="submit" style={{ marginTop: 10, padding: '14px 22px' }}>
            {mode === 'login' ? 'Entrar' : 'Plantar minha primeira semente'}
            <Icon name="arrowRight" size={14} />
          </Button>
        </form>

        <p style={loginStyles.legal}>
          ao entrar, você aceita os termos de uso e a política de privacidade.
          arvo guarda seus dados em servidores na União Europeia.
        </p>
      </main>
    </div>
  );
};

Object.assign(window, { LoginScreen });
