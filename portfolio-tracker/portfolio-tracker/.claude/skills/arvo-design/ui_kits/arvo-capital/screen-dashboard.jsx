/* ============================================================
   Arvo Capital — Dashboard
   Re-skinned from portfolio-tracker DashboardPage + ValueCards
   + AllocationChart + AssetTable
   ============================================================ */

const dashStyles = {
  page: { background: 'var(--arvo-offwhite)', minHeight: '100vh', fontFamily: "'Tenor Sans', sans-serif" },
  wrap: { maxWidth: 1180, margin: '0 auto', padding: '32px 28px 96px', display: 'flex', flexDirection: 'column', gap: 20 },

  // Hero ValueCard (dark)
  hero: {
    background: 'linear-gradient(135deg, #0D0D0D 0%, #1B1815 60%, #28221B 100%)',
    color: 'var(--arvo-offwhite)',
    borderRadius: 16, padding: 28,
    position: 'relative', overflow: 'hidden',
  },
  heroGlow: { position: 'absolute', top: -120, right: -80, width: 360, height: 360, borderRadius: '50%', background: 'rgba(200,184,154,0.10)', filter: 'blur(60px)' },
  heroTop: { position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, zIndex: 2 },
  heroLabel: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'var(--arvo-gold)', opacity: 0.75 },
  heroNum: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 56, letterSpacing: '0.02em', lineHeight: 1.05, marginTop: 12, color: 'var(--arvo-offwhite)' },
  heroTs: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(200,184,154,0.50)' },
  heroGrid: { position: 'relative', zIndex: 2, marginTop: 24, paddingTop: 22, borderTop: '1px solid rgba(200,184,154,0.18)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 },
  heroCell: { display: 'flex', flexDirection: 'column', gap: 6 },
  cellLabel: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(200,184,154,0.60)' },
  cellValue: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 18, letterSpacing: '0.04em', color: 'var(--arvo-offwhite)' },

  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20 },
  panel: {
    background: 'white',
    border: '1px solid var(--arvo-border)',
    borderRadius: 14, padding: 24,
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  panelTitle: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg)' },
  panelSub: { fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 13, color: 'var(--arvo-fg-soft)', marginTop: -10, marginBottom: 4 },

  // Allocation
  donutWrap: { display: 'flex', gap: 24, alignItems: 'center' },
  donutSvg: { flexShrink: 0 },
  legend: { flex: 1, display: 'flex', flexDirection: 'column', gap: 10 },
  legendRow: { display: 'grid', gridTemplateColumns: '12px 1fr 60px 90px', alignItems: 'center', gap: 10 },
  legendDot: { width: 10, height: 10, borderRadius: 999 },
  legendName: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 12, color: 'var(--arvo-fg)', letterSpacing: '0.04em' },
  legendPct: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 12, color: 'var(--arvo-fg)', textAlign: 'right' },
  legendValue: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 11, color: 'var(--arvo-fg-soft)', textAlign: 'right', letterSpacing: '0.04em' },

  // Asset table
  tHead: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 12, padding: '12px 4px', borderBottom: '1px solid var(--arvo-border-soft)', alignItems: 'center' },
  tHeadCell: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' },
  tRow: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 12, padding: '14px 4px', borderBottom: '1px solid var(--arvo-border-soft)', alignItems: 'center' },
  tAsset: { display: 'flex', alignItems: 'center', gap: 12 },
  tAvatar: { width: 28, height: 28, borderRadius: 6, background: 'rgba(13,13,13,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.08em', color: 'var(--arvo-fg-muted)' },
  tName: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 13, letterSpacing: '0.04em', color: 'var(--arvo-fg)' },
  tSub: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.15em', color: 'var(--arvo-fg-soft)', textTransform: 'uppercase', marginTop: 2 },
  tVal: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 13, color: 'var(--arvo-fg)', letterSpacing: '0.04em' },
  tValMute: { fontFamily: "'Tenor Sans', sans-serif", fontSize: 12, color: 'var(--arvo-fg-soft)', letterSpacing: '0.04em' },

  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  filterRow: { display: 'flex', gap: 8 },

  // Chart placeholder
  chartArea: { position: 'relative', height: 200, padding: '12px 0' },
};

// ─── ALLOCATION DONUT ────────────────────────────────────────
const ALLOC = [
  { name: 'Ações Brasil',  pct: 28, value: 23610, color: '#1B4FD8' },
  { name: 'FIIs',          pct: 18, value: 15178, color: '#A36A52' },
  { name: 'Renda Fixa',    pct: 22, value: 18550, color: '#C8B89A' },
  { name: 'Cripto',        pct: 10, value:  8432, color: '#0D0D0D' },
  { name: 'Exterior',      pct: 14, value: 11805, color: '#E8A020' },
  { name: 'Previdência',   pct:  8, value:  6745, color: '#D63B2F' },
];

const AllocationDonut = ({ data, size = 180 }) => {
  const r = size / 2;
  const inner = r - 26;
  let acc = 0;
  const total = data.reduce((s, d) => s + d.pct, 0);
  const segs = data.map((d) => {
    const start = (acc / total) * Math.PI * 2;
    acc += d.pct;
    const end = (acc / total) * Math.PI * 2;
    return { ...d, start, end };
  });
  const arc = (cx, cy, ro, ri, a1, a2) => {
    const x1 = cx + ro * Math.cos(a1 - Math.PI / 2), y1 = cy + ro * Math.sin(a1 - Math.PI / 2);
    const x2 = cx + ro * Math.cos(a2 - Math.PI / 2), y2 = cy + ro * Math.sin(a2 - Math.PI / 2);
    const x3 = cx + ri * Math.cos(a2 - Math.PI / 2), y3 = cy + ri * Math.sin(a2 - Math.PI / 2);
    const x4 = cx + ri * Math.cos(a1 - Math.PI / 2), y4 = cy + ri * Math.sin(a1 - Math.PI / 2);
    const large = a2 - a1 > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${ro} ${ro} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${ri} ${ri} 0 ${large} 0 ${x4} ${y4} Z`;
  };
  return (
    <svg width={size} height={size} style={dashStyles.donutSvg}>
      {segs.map((s, i) => (
        <path key={i} d={arc(r, r, r - 4, inner, s.start, s.end)} fill={s.color} stroke="white" strokeWidth="2" />
      ))}
      <text x={r} y={r - 4} textAnchor="middle" style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', fill: 'rgba(13,13,13,0.45)' }}>Patrimônio</text>
      <text x={r} y={r + 14} textAnchor="middle" style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 16, fill: 'var(--arvo-fg)' }}>€ 84.320</text>
    </svg>
  );
};

// ─── PERFORMANCE CHART (sparkline-style) ─────────────────────
const PerfChart = ({ accent = '#1B4FD8' }) => {
  const pts = [62, 64, 60, 66, 70, 67, 72, 75, 73, 78, 80, 84];
  const max = 90, min = 55;
  const W = 540, H = 180;
  const step = W / (pts.length - 1);
  const norm = v => H - ((v - min) / (max - min)) * (H - 20) - 10;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'} ${i * step} ${norm(p)}`).join(' ');
  const area = `${path} L ${W} ${H} L 0 ${H} Z`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="pgrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.20" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map(i => (
        <line key={i} x1="0" x2={W} y1={H * (i / 3)} y2={H * (i / 3)} stroke="rgba(13,13,13,0.06)" strokeDasharray="2 4" />
      ))}
      <path d={area} fill="url(#pgrad)" />
      <path d={path} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => i === pts.length - 1 && (
        <circle key={i} cx={i * step} cy={norm(p)} r="4" fill={accent} stroke="white" strokeWidth="2" />
      ))}
    </svg>
  );
};

// ─── ASSET TABLE ─────────────────────────────────────────────
const ASSETS = [
  { name: 'PETR4',  sub: 'Petrobras PN',    avatar: 'P4',  qty: '120',     price: 'R$ 38,40',   value: '€ 760,80',  delta: '+2.4%', pos: true },
  { name: 'ITUB4',  sub: 'Itaú Unibanco PN', avatar: 'I4', qty: '300',     price: 'R$ 33,12',   value: '€ 1.640,00', delta: '+0.8%', pos: true },
  { name: 'KNRI11', sub: 'Kinea Renda',     avatar: 'KN',  qty: '80',      price: 'R$ 168,50',  value: '€ 2.220,00', delta: '−0.3%', pos: false },
  { name: 'BTC',    sub: 'Bitcoin',         avatar: '₿',   qty: '0.1825',  price: 'US$ 92.140', value: '€ 15.560,00', delta: '+5.6%', pos: true },
  { name: 'CDB BC', sub: 'CDB Banco BC · CDI+1.2%', avatar: 'FX', qty: '—', price: '—',          value: '€ 8.420,00',  delta: '+0.9%', pos: true },
  { name: 'VOO',    sub: 'Vanguard S&P 500 ETF', avatar: 'VO', qty: '32',  price: 'US$ 510,20', value: '€ 14.230,00', delta: '+1.1%', pos: true },
];

const AssetTable = () => (
  <>
    <div style={dashStyles.toolbar}>
      <div style={dashStyles.filterRow}>
        <Tag color="gold">todas as classes</Tag>
        <Tag color="neutral" dot>brl · usd · eur</Tag>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="ghost" style={{ padding: '8px 14px', fontSize: 10 }}>
          <Icon name="filter" size={12} /> filtros
        </Button>
        <Button variant="blue" style={{ padding: '8px 14px', fontSize: 10 }}>
          <Icon name="add" size={12} /> aportar
        </Button>
      </div>
    </div>
    <div style={dashStyles.tHead}>
      <div style={dashStyles.tHeadCell}>ativo</div>
      <div style={{ ...dashStyles.tHeadCell, textAlign: 'right' }}>qtd</div>
      <div style={{ ...dashStyles.tHeadCell, textAlign: 'right' }}>preço</div>
      <div style={{ ...dashStyles.tHeadCell, textAlign: 'right' }}>valor €</div>
      <div style={{ ...dashStyles.tHeadCell, textAlign: 'right' }}>variação</div>
    </div>
    {ASSETS.map(a => (
      <div key={a.name} style={dashStyles.tRow}>
        <div style={dashStyles.tAsset}>
          <div style={dashStyles.tAvatar}>{a.avatar}</div>
          <div>
            <div style={dashStyles.tName}>{a.name}</div>
            <div style={dashStyles.tSub}>{a.sub}</div>
          </div>
        </div>
        <div style={{ ...dashStyles.tValMute, textAlign: 'right' }}>{a.qty}</div>
        <div style={{ ...dashStyles.tValMute, textAlign: 'right' }}>{a.price}</div>
        <div style={{ ...dashStyles.tVal, textAlign: 'right' }}>{a.value}</div>
        <div style={{ textAlign: 'right' }}>
          <Tag color={a.pos ? 'pos' : 'neg'}>{a.delta}</Tag>
        </div>
      </div>
    ))}
  </>
);

// ─── DASHBOARD ROOT ───────────────────────────────────────────
const DashboardScreen = ({ section, subPage }) => {
  const accent = section === 'invest' ? '#1B4FD8' : section === 'finances' ? '#A36A52' : '#0D0D0D';

  return (
    <div style={dashStyles.page}>
      <div style={dashStyles.wrap}>
        {/* Hero */}
        <div style={dashStyles.hero}>
          <div style={dashStyles.heroGlow} />
          <div style={dashStyles.heroTop}>
            <div>
              <div style={dashStyles.heroLabel}>Patrimônio total · EUR</div>
              <div style={dashStyles.heroNum}>€ 84.320</div>
              <div style={{ marginTop: 10 }}>
                <Tag color="ocre" dot style={{ background: 'rgba(200,184,154,0.18)', color: 'var(--arvo-gold)' }}>
                  ↑ +12.4% este ano
                </Tag>
              </div>
            </div>
            <div style={dashStyles.heroTs}>atualizado às 14:32</div>
          </div>
          <div style={dashStyles.heroGrid}>
            <div style={dashStyles.heroCell}>
              <span style={dashStyles.cellLabel}>investido</span>
              <span style={dashStyles.cellValue}>€ 75.000</span>
            </div>
            <div style={dashStyles.heroCell}>
              <span style={dashStyles.cellLabel}>resultado</span>
              <span style={{ ...dashStyles.cellValue, color: '#A5D9B3' }}>+ € 9.320</span>
            </div>
            <div style={dashStyles.heroCell}>
              <span style={dashStyles.cellLabel}>mês</span>
              <span style={{ ...dashStyles.cellValue, color: '#A5D9B3' }}>+ 1.8%</span>
            </div>
            <div style={dashStyles.heroCell}>
              <span style={dashStyles.cellLabel}>2026</span>
              <span style={{ ...dashStyles.cellValue, color: '#A5D9B3' }}>+ 12.4%</span>
            </div>
          </div>
        </div>

        {/* Two-up: performance + allocation */}
        <div style={dashStyles.twoCol}>
          <div style={dashStyles.panel}>
            <div style={dashStyles.panelTitle}>Alocação por classe</div>
            <div style={dashStyles.panelSub}>onde seu patrimônio está plantado</div>
            <div style={dashStyles.donutWrap}>
              <AllocationDonut data={ALLOC} />
              <div style={dashStyles.legend}>
                {ALLOC.map(a => (
                  <div key={a.name} style={dashStyles.legendRow}>
                    <span style={{ ...dashStyles.legendDot, background: a.color }} />
                    <span style={dashStyles.legendName}>{a.name}</span>
                    <span style={dashStyles.legendPct}>{a.pct}%</span>
                    <span style={dashStyles.legendValue}>€ {a.value.toLocaleString('pt-BR')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={dashStyles.panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={dashStyles.panelTitle}>Evolução do patrimônio</div>
                <div style={dashStyles.panelSub}>doze meses · em EUR</div>
              </div>
              <Segmented options={['1M', '6M', '1A', 'Tudo']} value="1A" onChange={() => {}} />
            </div>
            <div style={dashStyles.chartArea}>
              <PerfChart accent={accent} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Tag color="blue">linha · patrimônio</Tag>
              <Tag color="neutral">— meta 90k</Tag>
            </div>
          </div>
        </div>

        {/* Assets */}
        <div style={dashStyles.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div style={dashStyles.panelTitle}>Seus ativos</div>
              <div style={dashStyles.panelSub}>12 ativos · 4 instituições · 3 moedas</div>
            </div>
            <button style={{ background: 'transparent', border: 0, color: 'var(--arvo-fg-soft)', fontFamily: "'Tenor Sans', sans-serif", fontSize: 11, letterSpacing: '0.10em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              ver todos <Icon name="arrowRight" size={12} />
            </button>
          </div>
          <AssetTable />
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { DashboardScreen });
