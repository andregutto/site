const RED = '#D63B2F'

function initials(name?: string, email?: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (email) {
    const local = email.split('@')[0]
    const parts = local.split(/[._-]/)
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : local.slice(0, 2).toUpperCase()
  }
  return '?'
}

interface AvatarProps {
  name?: string
  email?: string
  size?: number
  tone?: 'neutral' | 'active'
}

export default function Avatar({ name, email, size = 28, tone = 'neutral' }: AvatarProps) {
  const letters = initials(name, email)
  const active = tone === 'active'
  return (
    <div style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: active ? 'rgba(214,59,47,0.10)' : 'var(--arvo-hover-bg)',
      border: `1px solid ${active ? 'rgba(214,59,47,0.20)' : 'var(--arvo-border)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        fontFamily: 'var(--arvo-font-display)', fontSize: size * 0.36,
        color: active ? RED : 'var(--arvo-fg-muted)', letterSpacing: '0.05em',
      }}>
        {letters}
      </span>
    </div>
  )
}
