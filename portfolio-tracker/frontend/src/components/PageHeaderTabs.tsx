interface TabItem<K extends string> {
  key: K
  label: string
}

interface Props<K extends string> {
  title: string
  subtitle?: string
  tabs: TabItem<K>[]
  activeTab: K
  onTabChange: (key: K) => void
  marginBottom?: number
}

export default function PageHeaderTabs<K extends string>({ title, subtitle, tabs, activeTab, onTabChange, marginBottom = 16 }: Props<K>) {
  return (
    <div style={{ marginBottom }}>
      <div style={{ marginBottom: 10 }}>
        <h1 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>{title}</h1>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: 'var(--arvo-fg-muted)' }}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', gap: 4, background: 'var(--arvo-track-bg)', borderRadius: 10, padding: 4 }}>
        {tabs.map(item => (
          <button
            key={item.key}
            onClick={() => onTabChange(item.key)}
            style={{
              flex: 1, padding: '6px 0', border: 'none', borderRadius: 7,
              fontSize: 14, fontFamily: 'var(--arvo-font-body)',
              fontWeight: activeTab === item.key ? 600 : 400,
              cursor: 'pointer',
              background: activeTab === item.key ? 'var(--arvo-surface)' : 'transparent',
              color: activeTab === item.key ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)',
              boxShadow: activeTab === item.key ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
