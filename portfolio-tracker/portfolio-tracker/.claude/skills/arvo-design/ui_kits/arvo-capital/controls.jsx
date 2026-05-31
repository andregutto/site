/* ============================================================
   Arvo Capital — controls
   Buttons, inputs, segmented switch, tags
   ============================================================ */

const controlsStyles = {
  button: {
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 12,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    padding: '11px 22px',
    border: 0,
    borderRadius: 3,
    cursor: 'pointer',
    transition: 'opacity 280ms cubic-bezier(0.22,0.61,0.36,1), background 280ms',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    lineHeight: 1,
  },
};

const Button = ({ variant = 'primary', children, onClick, style, type = 'button' }) => {
  const variants = {
    primary:   { background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)' },
    gold:      { background: 'var(--arvo-gold-cta)', color: '#fff' },  /* #C9911A — production CTA */
    secondary: { background: 'transparent', color: 'var(--arvo-black)', border: '1px solid var(--arvo-black)' },
    ghost:     { background: 'transparent', color: 'rgba(13,13,13,0.65)', border: '1px solid var(--arvo-border)' },
    ghostDark: { background: 'transparent', color: 'var(--arvo-offwhite)', border: '1px solid rgba(242,237,228,0.18)' },
    blue:      { background: 'var(--arvo-blue)', color: 'white' },
    red:       { background: 'var(--arvo-red)',  color: 'white' },
    ocre:      { background: 'var(--arvo-ocre)', color: '#2a1900' },
  };
  return (
    <button type={type} onClick={onClick}
      style={{ ...controlsStyles.button, ...variants[variant], ...style }}
      onMouseEnter={e => e.currentTarget.style.opacity = 0.85}
      onMouseLeave={e => e.currentTarget.style.opacity = 1}
    >{children}</button>
  );
};

const Label = ({ children, style }) => (
  <span style={{
    display: 'block',
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 10,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'rgba(13,13,13,0.55)',
    marginBottom: 6,
    ...style,
  }}>{children}</span>
);

const Input = ({ value, onChange, placeholder, type = 'text', style }) => {
  const [focus, setFocus] = React.useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        width: '100%',
        fontFamily: "'Tenor Sans', sans-serif",
        fontSize: 14,
        padding: '12px 14px',
        border: '1px solid ' + (focus ? 'var(--arvo-gold)' : 'var(--arvo-border)'),
        borderRadius: 3,
        background: 'white',
        color: 'var(--arvo-fg)',
        outline: 'none',
        boxShadow: focus ? '0 0 0 2px rgba(200,184,154,0.25)' : 'none',
        transition: 'border-color 280ms, box-shadow 280ms',
        ...style,
      }}
    />
  );
};

const Segmented = ({ options, value, onChange }) => (
  <div style={{
    display: 'inline-flex',
    background: 'rgba(13,13,13,0.06)',
    borderRadius: 6,
    padding: 3,
    gap: 2,
  }}>
    {options.map(o => (
      <button key={o} onClick={() => onChange(o)} style={{
        fontFamily: "'Tenor Sans', sans-serif",
        fontSize: 11,
        letterSpacing: '0.10em',
        padding: '6px 14px',
        border: 0,
        background: value === o ? 'white' : 'transparent',
        color: value === o ? 'var(--arvo-fg)' : 'rgba(13,13,13,0.55)',
        borderRadius: 4,
        boxShadow: value === o ? '0 1px 2px rgba(13,13,13,0.06)' : 'none',
        cursor: 'pointer',
        transition: 'all 200ms',
      }}>{o}</button>
    ))}
  </div>
);

const Tag = ({ color = 'gold', children, dot, style }) => {
  const colors = {
    blue: { bg: 'rgba(27,79,216,0.10)',  fg: '#1B4FD8', dot: '#1B4FD8' },
    red:  { bg: 'rgba(214,59,47,0.10)',  fg: '#D63B2F', dot: '#D63B2F' },
    ocre: { bg: 'rgba(232,160,32,0.14)', fg: '#946400', dot: '#E8A020' },
    gold: { bg: 'rgba(200,184,154,0.18)', fg: '#8A7956', dot: '#C8B89A' },
    pos:  { bg: 'rgba(30,111,58,0.08)',  fg: '#1e6f3a', dot: '#1e6f3a' },
    neg:  { bg: 'rgba(184,48,32,0.08)',  fg: '#B83020', dot: '#B83020' },
    neutral: { bg: 'rgba(13,13,13,0.06)', fg: 'rgba(13,13,13,0.65)', dot: 'rgba(13,13,13,0.45)' },
  };
  const c = colors[color];
  return (
    <span style={{
      fontFamily: "'Tenor Sans', sans-serif",
      fontSize: 10,
      letterSpacing: '0.10em',
      padding: '5px 12px',
      borderRadius: 999,
      background: c.bg,
      color: c.fg,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      lineHeight: 1.2,
      ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: c.dot }} />}
      {children}
    </span>
  );
};

const Eyebrow = ({ children, style }) => (
  <div style={{
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 10,
    letterSpacing: '0.30em',
    textTransform: 'uppercase',
    color: 'var(--arvo-gold)',
    opacity: 0.65,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    ...style,
  }}>
    {children}
    <span style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(200,184,154,0.35), transparent)' }} />
  </div>
);

Object.assign(window, { Button, Label, Input, Segmented, Tag, Eyebrow });
