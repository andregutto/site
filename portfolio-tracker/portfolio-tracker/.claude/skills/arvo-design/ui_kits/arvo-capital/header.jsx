/* ============================================================
   Arvo Capital — Header
   Re-skinned from portfolio-tracker/AppLayout.tsx
   - Top bar: wordmark + section tabs + currency + avatar
   - Sub-nav: pill row for current section
   ============================================================ */

const headerStyles = {
  bar: {
    height: 60,
    background: 'rgba(242, 237, 228, 0.85)',
    backdropFilter: 'blur(12px) saturate(1.05)',
    WebkitBackdropFilter: 'blur(12px) saturate(1.05)',
    borderBottom: '1px solid var(--arvo-border-soft)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 28px',
    gap: 24,
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  wordmark: {
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 19,
    letterSpacing: '0.30em',
    textIndent: '0.30em',
    color: 'var(--arvo-black)',
    textDecoration: 'none',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    cursor: 'pointer',
  },
  product: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    paddingLeft: 14,
    borderLeft: '1px solid var(--arvo-border)',
    height: 24,
  },
  productName: {
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 13,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'rgba(13,13,13,0.65)',
    lineHeight: 1,
  },
  tabs: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    gap: 4,
  },
  tab: (active) => ({
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 12,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    padding: '8px 18px',
    borderRadius: 999,
    border: 0,
    cursor: 'pointer',
    background: active ? 'rgba(13,13,13,0.92)' : 'transparent',
    color: active ? 'var(--arvo-offwhite)' : 'rgba(13,13,13,0.55)',
    transition: 'all 280ms cubic-bezier(0.22,0.61,0.36,1)',
    whiteSpace: 'nowrap',
  }),
  right: { display: 'flex', alignItems: 'center', gap: 14 },
  avatar: {
    width: 30, height: 30, borderRadius: 999,
    background: 'var(--arvo-black)',
    color: 'var(--arvo-gold)',
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 10,
    letterSpacing: '0.10em',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  subnav: {
    background: 'rgba(232, 223, 208, 0.45)',
    borderBottom: '1px solid var(--arvo-border-soft)',
    padding: '8px 28px',
    display: 'flex',
    gap: 4,
    justifyContent: 'center',
    overflowX: 'auto',
  },
  subTab: (active, accent) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 14px',
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 11,
    letterSpacing: '0.08em',
    borderRadius: 8,
    border: '1px solid ' + (active ? 'var(--arvo-border)' : 'transparent'),
    background: active ? 'white' : 'transparent',
    color: active ? 'var(--arvo-fg)' : 'rgba(13,13,13,0.55)',
    cursor: 'pointer',
    transition: 'all 200ms',
    whiteSpace: 'nowrap',
    boxShadow: active ? '0 1px 2px rgba(13,13,13,0.04)' : 'none',
    position: 'relative',
  }),
  subTabDot: (accent) => ({
    width: 5, height: 5, borderRadius: 999,
    background: accent,
    flexShrink: 0,
  }),
};

const SECTIONS = [
  { key: 'invest',   label: 'Investimentos', accent: '#1B4FD8' },
  { key: 'finances', label: 'Finanças',      accent: '#A36A52' },
  { key: 'lugares',  label: 'Instituições',  accent: 'var(--arvo-black)' },
];

const SUBNAV_BY_SECTION = {
  invest: [
    { key: 'dashboard',   label: 'Dashboard',     icon: 'dashboard' },
    { key: 'performance', label: 'Performance',   icon: 'performance' },
    { key: 'aportes',     label: 'Aportes',       icon: 'add' },
    { key: 'rebalance',   label: 'Rebalancear',   icon: 'rebalance' },
    { key: 'classes',     label: 'Classes',       icon: 'classes' },
    { key: 'ir',          label: 'Relatórios',    icon: 'reports' },
  ],
  finances: [
    { key: 'overview',     label: 'Visão geral',   icon: 'dashboard' },
    { key: 'budget',       label: 'Orçamento',     icon: 'budget' },
    { key: 'transactions', label: 'Transações',    icon: 'transactions' },
    { key: 'moments',      label: 'Momentos',      icon: 'moments' },
    { key: 'freedom',      label: 'Liberdade',     icon: 'freedom' },
  ],
  lugares: [],
};

const Header = ({ section, setSection, subPage, setSubPage, onSignOut }) => {
  const accent = SECTIONS.find(s => s.key === section)?.accent ?? 'var(--arvo-black)';
  const subItems = SUBNAV_BY_SECTION[section] ?? [];
  return (
    <>
      <header style={headerStyles.bar}>
        <a style={headerStyles.wordmark} onClick={() => { setSection('invest'); setSubPage('dashboard'); }}>
          <img src="../../assets/logo/arvo-symbol-black.svg" width="24" height="25" alt="" />
          arvo
        </a>
        <div style={headerStyles.product}>
          <span style={headerStyles.productName}>Capital</span>
        </div>
        <nav style={headerStyles.tabs}>
          {SECTIONS.map(s => (
            <button key={s.key} style={headerStyles.tab(section === s.key)} onClick={() => setSection(s.key)}>
              {s.label}
            </button>
          ))}
        </nav>
        <div style={headerStyles.right}>
          <Segmented options={['BRL', 'USD', 'EUR']} value="EUR" onChange={() => {}} />
          <button style={headerStyles.avatar} title="André" onClick={onSignOut}>AG</button>
        </div>
      </header>
      {subItems.length > 0 && (
        <nav style={headerStyles.subnav}>
          {subItems.map(s => (
            <button key={s.key} style={headerStyles.subTab(subPage === s.key, accent)} onClick={() => setSubPage(s.key)}>
              {subPage === s.key
                ? <span style={headerStyles.subTabDot(accent)} />
                : <span style={{ color: 'rgba(13,13,13,0.35)', display: 'flex' }}><Icon name={s.icon} size={14} /></span>
              }
              {s.label}
            </button>
          ))}
        </nav>
      )}
    </>
  );
};

Object.assign(window, { Header, SECTIONS, SUBNAV_BY_SECTION });
