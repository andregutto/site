import type React from 'react'
import { useNavigate } from 'react-router-dom'

// Envolve avatar/nome de um usuário e navega pro perfil público (/u/:username)
// ao clicar, com stopPropagation pra não disparar o clique do card pai (ex.:
// abrir o tópico da comunidade ou a conversa de mensagens). Nem todo usuário
// tem @username, então aceita o userId como fallback — o endpoint do perfil
// resolve os dois formatos. Sem nenhum dos dois o wrapper vira <span> inerte.
export default function ProfileLink({ username, userId, children, className, style }: {
  username?: string | null
  userId?: string | null
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const navigate = useNavigate()
  const target = username ?? userId
  if (!target) return <span className={className} style={style}>{children}</span>
  const go = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    navigate(`/u/${target}`)
  }
  return (
    <span
      className={className}
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={e => { if (e.key === 'Enter') go(e) }}
      style={{ cursor: 'pointer', ...style }}
    >
      {children}
    </span>
  )
}
