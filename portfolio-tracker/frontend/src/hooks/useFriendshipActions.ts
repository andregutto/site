import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'

export type FriendshipStatus = 'self' | 'active' | 'pending' | 'none'

// Mecanismos de amizade/mensagem compartilhados entre o PostCard da comunidade
// (via CommunityTopicPage) e a página de perfil /u/:username — mesma API de
// status em lote, mesmo update otimista no convite e mesma criação de conversa.
// Extraído do CommunityTopicPage pra não duplicar a lógica.
export function useFriendshipActions() {
  const navigate = useNavigate()
  const [statuses, setStatuses] = useState<Record<string, FriendshipStatus>>({})

  async function loadStatuses(userIds: string[], selfId?: string) {
    const uniqueIds = [...new Set(userIds)].filter(id => id !== selfId)
    if (!uniqueIds.length) return
    try {
      const res = await apiFetch<{ statuses: Record<string, FriendshipStatus> }>(`/messages/friendship-status?user_ids=${uniqueIds.join(',')}`)
      setStatuses(prev => ({ ...prev, ...res.statuses }))
    } catch {
      // botões de amizade/mensagem só não aparecem se isso falhar — não é crítico
    }
  }

  async function invite(userId: string, username: string) {
    setStatuses(prev => ({ ...prev, [userId]: 'pending' }))
    try {
      await apiFetch('/people/invite', { method: 'POST', body: JSON.stringify({ username }) })
    } catch {
      setStatuses(prev => ({ ...prev, [userId]: 'none' }))
    }
  }

  async function message(userId: string) {
    try {
      const res = await apiFetch<{ conversation: { id: number } }>('/messages/conversations', {
        method: 'POST', body: JSON.stringify({ peer_user_id: userId }),
      })
      navigate(`/messages/${res.conversation.id}`)
    } catch {
      // amizade pode ter sido desfeita entre o load da página e o clique — ignora
    }
  }

  return { statuses, setStatuses, loadStatuses, invite, message }
}
