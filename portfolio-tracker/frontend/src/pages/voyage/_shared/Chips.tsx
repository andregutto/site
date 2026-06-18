const RED  = '#D63B2F'
const BLUE = '#1B4FD8'
const GREEN = '#1F8A5B'
const GOLD  = '#C8B89A'

const CHIP_BASE: React.CSSProperties = {
  fontFamily: 'var(--arvo-font-display)',
  textTransform: 'uppercase',
  borderRadius: 999,
  display: 'inline-block',
  flexShrink: 0,
}

export function RoleChip({ role }: { role: string }) {
  if (role === 'owner') return (
    <span style={{ ...CHIP_BASE, fontSize: 9, letterSpacing: '0.18em', padding: '2px 8px', background: 'rgba(214,59,47,0.08)', color: RED, border: '1px solid rgba(214,59,47,0.18)' }}>
      Owner
    </span>
  )
  if (role === 'editor') return (
    <span style={{ ...CHIP_BASE, fontSize: 9, letterSpacing: '0.18em', padding: '2px 8px', background: 'rgba(27,79,216,0.08)', color: BLUE, border: '1px solid rgba(27,79,216,0.18)' }}>
      Editor
    </span>
  )
  return (
    <span style={{ ...CHIP_BASE, fontSize: 9, letterSpacing: '0.18em', padding: '2px 8px', background: 'var(--arvo-hover-bg)', color: 'var(--arvo-fg-muted)', border: '1px solid var(--arvo-border)' }}>
      Leitor
    </span>
  )
}

export function StatusChip({ status }: { status: string }) {
  if (status === 'active') return (
    <span style={{ ...CHIP_BASE, fontSize: 9, letterSpacing: '0.20em', padding: '3px 10px', background: 'rgba(31,138,91,0.10)', color: GREEN, border: '1px solid rgba(31,138,91,0.20)' }}>
      Ativo
    </span>
  )
  if (status === 'left') return (
    <span style={{ ...CHIP_BASE, fontSize: 9, letterSpacing: '0.20em', padding: '3px 10px', background: 'var(--arvo-hover-bg)', color: 'var(--arvo-fg-soft)', border: '1px solid var(--arvo-border)' }}>
      Saiu
    </span>
  )
  return (
    <span style={{ ...CHIP_BASE, fontSize: 9, letterSpacing: '0.20em', padding: '3px 10px', background: 'rgba(200,184,154,0.12)', color: GOLD, border: '1px solid rgba(200,184,154,0.25)' }}>
      Pendente
    </span>
  )
}
