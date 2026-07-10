import { useState, useEffect, useCallback, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { invalidateActiveFriends } from '../hooks/useActiveFriends'
import { useI18n } from '../contexts/I18nContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import Avatar from './voyage/_shared/Avatar'
import { RoleChip } from './voyage/_shared/Chips'
import ExpensesPanel, { type MomentMeta } from './finances/ExpensesPanel'
import ArvoLoader from '../components/ArvoLoader'
import { _fmt } from './finances/FinancesMomentsPage'
import { GroupModal, InviteModal, ModalOverlay, type Group as SharedGroupFull } from '../components/SharedGroupModals'
import GroupSplitSection from '../components/GroupSplitSection'
import { Switch } from '../components/ui'

const RED  = '#D63B2F'
const GOLD = '#C8B89A'

type Direction = 'owned_by_me' | 'shared_with_me'

interface TripContext {
  type: 'voyage_trip'
  direction: Direction
  trip_id: number
  trip_title: string
  role: string
  member_id: number
  member_status: 'active' | 'pending'
}

interface FinanceContext {
  type: 'shared_finance'
  direction: Direction
  group_id: number
  group_name: string
  member_id: number
  member_status: 'active' | 'pending'
}

interface MomentContext {
  type: 'finance_moment'
  direction: Direction
  moment_id: number
  moment_name: string
  role: string
  member_id: number
  member_status: 'active' | 'pending'
}

interface FriendContext {
  type: 'friend'
  direction: Direction
  friend_id: number
  friend_status: 'active' | 'pending'
  accept_token?: string
  auto_accept_invites?: boolean
}

type Context = TripContext | FinanceContext | MomentContext | FriendContext

export interface Balance { currency: string; amount: number }
export interface MomentBalance { moment_id: number; moment_name: string; is_pair_default?: boolean; shared_group_id?: number | null; balances: Balance[] }

interface Contact {
  email: string
  name?: string
  username?: string
  avatar_url?: string
  user_id: string | null
  status: 'active' | 'pending'
  contexts: Context[]
  balances?: Balance[]
  balancesByMoment?: MomentBalance[]
}

interface Trip { id: number; title: string }
interface Group { id: number; name: string }
interface MomentOption { id: number; name: string }
interface UserSuggestion { user_id: string; username: string; name?: string; avatar_url?: string }

// Bloco recolhível genérico — os cards de contato viviam ficando enormes com
// várias viagens/momentos/categorias compartilhadas todas abertas ao mesmo
// tempo; agora cada seção some por padrão e mostra só a contagem.
function CollapsibleSection({ title, count, children, defaultOpen }: { title: string; count: number; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 12, marginBottom: 4 }}>
      <button
        type="button" onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: open ? 6 : 0 }}
      >
        <p style={{
          fontFamily: 'var(--arvo-font-display)', fontSize: 12.5, letterSpacing: '0.16em',
          textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', flex: 1, textAlign: 'left',
        }}>
          {title} <span style={{ color: 'var(--arvo-fg-soft)' }}>({count})</span>
        </p>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="var(--arvo-fg-soft)" strokeWidth="1.5" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 4.5L6 8l3.5-3.5" />
        </svg>
      </button>
      {open && children}
    </div>
  )
}

// Painel de despesas do Momento 1:1 oculto (criado sob demanda entre dois
// amigos) — reaproveita o ExpensesPanel normal (mesma lista + form de nova
// despesa) só que sem a moldura de Momento (nome/ícone/capa/colaboradores),
// já que pra quem usa o Arvo só como Splitwise esse conceito nunca aparece.
export function PairMomentModal({ friendUserId, friendName, friendAvatarUrl, initialMomentId, balancesByMoment, sharedGroups, onClose, onPromoted }: {
  friendUserId: string
  friendName: string
  friendAvatarUrl?: string
  initialMomentId: number | null
  // Saldos por Momento com esse amigo (inclui Momentos de grupo compartilhado). Quando
  // existe saldo pendente num Momento que NÃO é o 1:1 oculto, a despesa provavelmente
  // pertence a esse grupo — perguntamos antes de abrir direto o 1:1, senão a despesa some
  // dentro do saldo do grupo sem o usuário entender de onde veio (bug real relatado).
  balancesByMoment?: MomentBalance[]
  // Grupos em comum com esse amigo (ambos membros ativos) — entram como sugestão
  // de destino mesmo sem saldo pendente: são o contexto natural de "despesa da galera".
  sharedGroups?: { group_id: number; name: string }[]
  onClose: () => void
  // Disparado quando o par 1:1 oculto é promovido a Momento nomeado (3ª pessoa) —
  // o pai recarrega listas de amigos/momentos pra refletir a mudança de estrutura.
  onPromoted?: () => void
}) {
  const { t } = useI18n()
  const { user } = useAuth()
  // Meta do Momento aberto (vinda do ExpensesPanel): nome quando não é o 1:1
  // puro (Momento nomeado ou Momento padrão de grupo), e participantes ativos
  // pros avatares do header.
  const [headerMeta, setHeaderMeta] = useState<MomentMeta | null>(null)
  const promotedName = headerMeta && (!headerMeta.is_pair_default || headerMeta.shared_group_id != null) ? headerMeta.name : null
  const { currency, hideValues } = useCurrency()
  const { resolvedTheme } = useTheme()
  // Sugestões de destino da despesa (pedido do André 2026-07-10):
  //  1. Momentos com saldo EM ABERTO com esse amigo — quitados ficam de fora de
  //     propósito ("medo de ficar coisa demais"). Momentos nomeados e de grupo;
  //     o 1:1 puro (is_pair_default sem shared_group_id) nunca é sugestão, é o destino padrão.
  //  2. Grupos em comum ainda sem saldo (os com saldo já aparecem pela via 1,
  //     dedupe por shared_group_id).
  //  3. "Só entre vocês dois" (o 1:1 oculto).
  const momentOptions = (balancesByMoment ?? []).filter(m => !(m.is_pair_default && m.shared_group_id == null) && m.balances.some(b => Math.abs(b.amount) >= 0.01))
  const balanceGroupIds = new Set(momentOptions.map(m => m.shared_group_id).filter((id): id is number => id != null))
  const plainGroups = (sharedGroups ?? []).filter((g, i, arr) => !balanceGroupIds.has(g.group_id) && arr.findIndex(x => x.group_id === g.group_id) === i)
  const needsChoice = initialMomentId == null && (momentOptions.length > 0 || plainGroups.length > 0)
  const [momentId, setMomentId] = useState<number | null>(initialMomentId)
  const [choiceMade, setChoiceMade] = useState(!needsChoice)
  const [loading, setLoading] = useState(!initialMomentId && !needsChoice)
  const [groupBusy, setGroupBusy] = useState(false)
  const [error, setError] = useState('')
  const fmt = (n: number, c: string) => hideValues ? '•••' : _fmt(n, c)

  useEffect(() => {
    if (momentId != null) return // já resolvido (grupo escolhido, ou passado de fora)
    if (!choiceMade) return // esperando o usuário escolher pessoa vs grupo
    setLoading(true)
    apiFetch<{ moment_id: number }>(`/finances/moments/default-with/${friendUserId}`, { method: 'POST' })
      .then(r => setMomentId(r.moment_id))
      .catch((ex: unknown) => setError((ex as Error).message ?? t.people.loadErrorDefault))
      .finally(() => setLoading(false))
  }, [friendUserId, momentId, choiceMade])

  // Grupo escolhido como destino: resolve (ou cria) o Momento padrão do grupo —
  // mesma rota que o GroupExpensesModal usa.
  function openGroup(groupId: number) {
    setGroupBusy(true)
    setError('')
    apiFetch<{ moment_id: number }>(`/shared/groups/${groupId}/default-moment`, { method: 'POST' })
      .then(r => setMomentId(r.moment_id))
      .catch((ex: unknown) => setError((ex as Error).message ?? t.people.loadErrorDefault))
      .finally(() => setGroupBusy(false))
  }

  return createPortal(
    // O portal renderiza direto em document.body, fora do wrapper com a classe
    // .dark do AppLayout — sem isso, o modal caía sempre no tema claro (fundo branco).
    // Bottom-sheet no mobile (colado embaixo, cantos só em cima) — igual ao padrão
    // já usado em outros modais do app (ex: ModalOverlay de SharedGroupModals) —
    // aproveita mais a tela num formulário que já é comprido (saldos + despesas +
    // form de nova despesa), em vez do card centralizado com sobra de espaço nas
    // bordas.
    <div className={`fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 ${resolvedTheme === 'dark' ? 'dark' : ''}`} style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        className="relative w-full sm:max-w-[480px] max-h-[92vh] sm:max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{ background: 'var(--arvo-surface)', boxShadow: 'var(--arvo-shadow-lg)', padding: '20px 22px calc(28px + env(safe-area-inset-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {/* Avatares antes do título: no 1:1 o avatar do amigo; num Momento com
              mais gente, a pilha dos participantes (sem o próprio usuário). */}
          {(() => {
            const others = (headerMeta?.participants ?? []).filter(p => p.user_id !== user?.id)
            const shown = others.length > 0 ? others.slice(0, 3) : [{ user_id: friendUserId, name: friendName, email: undefined, avatar_url: friendAvatarUrl }]
            return (
              <div className="flex -space-x-2" style={{ flexShrink: 0 }}>
                {shown.map(p => (
                  <div key={p.user_id} style={{ border: '2px solid var(--arvo-surface)', borderRadius: '50%' }}>
                    <Avatar name={p.name} email={p.email} avatarUrl={p.avatar_url} size={26} />
                  </div>
                ))}
                {others.length > 3 && (
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--arvo-surface)',
                    background: 'var(--arvo-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--arvo-font-body)', fontSize: 11, fontWeight: 600, color: 'var(--arvo-fg-soft)',
                  }}>
                    +{others.length - 3}
                  </div>
                )}
              </div>
            )
          })()}
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)', flex: 1 }}>
            {promotedName ?? `${t.people.expensesWithPrefix} ${friendName}`}
          </p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path strokeLinecap="round" d="M1.5 1.5l11 11M12.5 1.5l-11 11" />
            </svg>
          </button>
        </div>
        {momentId == null && needsChoice && !choiceMade ? (
          <div>
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg-soft)', marginBottom: 10 }}>
              {t.people.splitWhereTitle}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {momentOptions.map(m => (
                <button
                  key={m.moment_id}
                  type="button"
                  disabled={groupBusy}
                  onClick={() => setMomentId(m.moment_id)}
                  className="w-full text-left flex items-center gap-3"
                  style={{ padding: '10px 10px', borderRadius: 10, background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <span style={{ flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg)' }}>{m.moment_name}</span>
                  {m.balances.map(b => (
                    <span key={b.currency} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, fontWeight: 600, color: b.amount > 0 ? '#1F8A5B' : RED }}>
                      {b.amount > 0 ? '+' : '−'}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: b.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(b.amount))}
                    </span>
                  ))}
                </button>
              ))}
              {plainGroups.map(g => (
                <button
                  key={`g${g.group_id}`}
                  type="button"
                  disabled={groupBusy}
                  onClick={() => openGroup(g.group_id)}
                  className="w-full text-left flex items-center gap-3"
                  style={{ padding: '10px 10px', borderRadius: 10, background: 'none', border: 'none', cursor: 'pointer', opacity: groupBusy ? 0.5 : 1 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <span style={{ flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg)' }}>{g.name}</span>
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--arvo-fg-soft)', border: '1px solid var(--arvo-border)', borderRadius: 999, padding: '2px 8px' }}>
                    {(t as any).people?.splitGroupTag ?? 'Grupo'}
                  </span>
                </button>
              ))}
              <button
                type="button"
                disabled={groupBusy}
                onClick={() => setChoiceMade(true)}
                className="w-full text-left flex items-center gap-3"
                style={{ padding: '10px 10px', borderRadius: 10, background: 'none', border: 'none', cursor: 'pointer', borderTop: '1px solid var(--arvo-border-soft)', marginTop: 4, paddingTop: 14 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <span style={{ flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg)' }}>{t.people.splitOnlyBetween}</span>
              </button>
            </div>
            {error && <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: RED, marginTop: 8 }}>{error}</p>}
          </div>
        ) : loading ? (
          <div className="flex justify-center py-5"><ArvoLoader size={26} style={{ color: 'var(--arvo-gold)' }} /></div>
        ) : error ? (
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: RED }}>{error}</p>
        ) : momentId ? (
          <ExpensesPanel momentId={momentId} currency={currency} fmt={fmt} onPromoted={onPromoted} onMetaChange={setHeaderMeta} />
        ) : null}
      </div>
    </div>,
    document.body
  )
}

// Linha unificada pra qualquer recurso compartilhado (viagem/categoria/momento) —
// mesmo padrão visual nos três, em vez de cada seção ter seu próprio estilo de
// botão "Remover"/"Ver". Pendente vira um ponto dourado (sem texto repetido —
// a seção já deixa claro o que é); dono vê um × pra revogar o acesso; convidado
// vê uma seta pra abrir o recurso.
function ResourceRow({
  icon, title, role, status, ownedByMe, onRemove, onView, removing, pendingTitle,
}: {
  icon: React.ReactNode
  title: string
  role?: string
  status: 'active' | 'pending'
  ownedByMe: boolean
  onRemove?: () => void
  onView: () => void
  removing?: boolean
  pendingTitle: string
}) {
  const { t } = useI18n()
  return (
    <div
      role="button" tabIndex={0}
      onClick={onView}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView() } }}
      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--arvo-border-soft)', cursor: 'pointer' }}
    >
      <span style={{ color: 'var(--arvo-fg-muted)', display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
      </span>
      {role && <RoleChip role={role} />}
      {status === 'pending' ? (
        <span title={pendingTitle} style={{ width: 7, height: 7, borderRadius: 999, background: GOLD, flexShrink: 0 }} />
      ) : ownedByMe && onRemove ? (
        <button
          type="button" onClick={e => { e.stopPropagation(); onRemove() }} disabled={removing} title={t.people.removeAccessTitle}
          style={{
            width: 22, height: 22, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: '1px solid var(--arvo-border)', cursor: removing ? 'default' : 'pointer',
            color: 'var(--arvo-fg-soft)', opacity: removing ? 0.4 : 1, transition: 'border-color 140ms, color 140ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--arvo-border)'; e.currentTarget.style.color = 'var(--arvo-fg-soft)' }}
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path strokeLinecap="round" d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
        </button>
      ) : (
        <span title={t.people.view} style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--arvo-fg-soft)' }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 2l4 4-4 4" />
          </svg>
        </span>
      )}
    </div>
  )
}

function ContactCard({
  contact, trips, groups, moments, onRemoved, onFriendChanged,
}: {
  contact: Contact
  trips: Trip[]
  groups: Group[]
  moments: MomentOption[]
  onRemoved: (memberId: number, type: string) => void
  onFriendChanged: () => void
}) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [togglingAutoAccept, setTogglingAutoAccept] = useState(false)
  const [shareMode, setShareMode] = useState<'trip' | 'group' | 'moment' | null>(null)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [shareTarget, setShareTarget] = useState<number | ''>('')
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState('')
  const [settling, setSettling] = useState(false)
  const [pairModal, setPairModal] = useState<{ momentId: number | null } | null>(null)

  async function settleUp() {
    if (!contact.user_id) return
    if (!confirm(t.people.settleUpConfirm)) return
    setSettling(true)
    try {
      await apiFetch('/people/settle', { method: 'POST', body: JSON.stringify({ friend_user_id: contact.user_id }) })
      onFriendChanged()
    } finally {
      setSettling(false)
    }
  }

  async function removeTrip(ctx: TripContext) {
    if (!confirm(t.people.removeTripConfirm.replace('{email}', contact.email).replace('{title}', ctx.trip_title))) return
    setRemoving(ctx.member_id)
    try {
      await apiFetch(`/voyage/trips/${ctx.trip_id}/members/${ctx.member_id}`, { method: 'DELETE' })
      onRemoved(ctx.member_id, 'voyage_trip')
    } finally {
      setRemoving(null)
    }
  }

  async function removeFinance(ctx: FinanceContext) {
    if (!confirm(t.people.removeCategoryConfirm.replace('{email}', contact.email).replace('{name}', ctx.group_name))) return
    setRemoving(ctx.member_id)
    try {
      await apiFetch(`/shared/groups/${ctx.group_id}/members/${ctx.member_id}`, { method: 'DELETE' })
      onRemoved(ctx.member_id, 'shared_finance')
    } finally {
      setRemoving(null)
    }
  }

  async function removeMoment(ctx: MomentContext) {
    if (!confirm(t.people.removeMomentConfirm.replace('{email}', contact.email).replace('{name}', ctx.moment_name))) return
    setRemoving(ctx.member_id)
    try {
      await apiFetch(`/finances/moments/${ctx.moment_id}/members/${ctx.member_id}`, { method: 'DELETE' })
      onRemoved(ctx.member_id, 'finance_moment')
    } finally {
      setRemoving(null)
    }
  }

  async function acceptFriend(ctx: FriendContext) {
    if (!ctx.accept_token) return
    setAccepting(true)
    try {
      await apiFetch('/people/invite/accept', { method: 'POST', body: JSON.stringify({ token: ctx.accept_token }) })
      onFriendChanged()
    } finally {
      setAccepting(false)
    }
  }

  async function unfriend(ctx: FriendContext) {
    if (!confirm(t.people.removeFriendConfirm.replace('{email}', contact.email))) return
    await apiFetch(`/people/friends/${ctx.friend_id}`, { method: 'DELETE' })
    onFriendChanged()
  }

  async function toggleAutoAccept(ctx: FriendContext) {
    if (!contact.user_id) return
    setTogglingAutoAccept(true)
    try {
      await apiFetch('/people/friends/auto-accept', {
        method: 'PATCH',
        body: JSON.stringify({ friend_user_id: contact.user_id, auto_accept_invites: !ctx.auto_accept_invites }),
      })
      onFriendChanged()
    } finally {
      setTogglingAutoAccept(false)
    }
  }

  async function confirmShare() {
    if (!shareMode || shareTarget === '') return
    setSharing(true)
    setShareError('')
    try {
      const path = shareMode === 'trip'
        ? `/voyage/trips/${shareTarget}/invite`
        : shareMode === 'moment'
        ? `/finances/moments/${shareTarget}/invite`
        : `/shared/groups/${shareTarget}/invite`
      await apiFetch(path, { method: 'POST', body: JSON.stringify({ email: contact.email }) })
      setShareMode(null)
      setShareTarget('')
      onFriendChanged()
    } catch (ex: unknown) {
      setShareError((ex as Error).message ?? t.people.shareErrorDefault)
    } finally {
      setSharing(false)
    }
  }

  const tripContexts    = contact.contexts.filter((c): c is TripContext    => c.type === 'voyage_trip')
  const financeContexts = contact.contexts.filter((c): c is FinanceContext => c.type === 'shared_finance')
  const momentContexts  = contact.contexts.filter((c): c is MomentContext  => c.type === 'finance_moment')
  const friendContexts  = contact.contexts.filter((c): c is FriendContext  => c.type === 'friend')
  const displayName = contact.name || contact.email

  // Estado de amizade resumido num único valor — vira o badge do cabeçalho
  // (era ali que "Ativo" conflitava com "Conectado" lá dentro: agora só
  // existe um lugar dizendo o status da relação).
  const incomingPending = friendContexts.find(c => c.friend_status === 'pending' && c.direction === 'shared_with_me' && c.accept_token)
  const mineFriendCtx = friendContexts.find(c => c.direction === 'owned_by_me')
  const outgoingPending = friendContexts.find(c => c.friend_status === 'pending' && c.direction === 'owned_by_me')
  const removableFriendCtx = mineFriendCtx ?? friendContexts[0]
  const isConnected = friendContexts.length > 0 && !incomingPending && !outgoingPending
  const friendState: 'incoming' | 'outgoing' | 'connected' | null =
    friendContexts.length === 0 ? null : incomingPending ? 'incoming' : outgoingPending ? 'outgoing' : 'connected'
  const auto = mineFriendCtx?.auto_accept_invites ?? false
  const isActive = friendState === 'connected' || contact.status === 'active'

  return (
    <div style={{
      background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
      borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '14px 16px',
    }}>
      {/* Cabeçalho — sempre visível; o resto só aparece expandido (senão a
          lista fica enorme com várias pessoas). É uma <div> clicável (não
          <button>) porque o botão de "dividir despesa" precisa ficar dentro
          dela — botão dentro de botão não é válido em HTML. Uma linha só
          (nome + @usuário, sem e-mail) pra ficar com a mesma altura do card
          de Grupos — o e-mail completo só aparece expandido. */}
      <div
        role="button" tabIndex={0}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(v => !v) }}
        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: expanded ? 14 : 0, textAlign: 'left' }}
      >
        <Avatar name={contact.name} email={contact.email} avatarUrl={contact.avatar_url} size={28} tone={isActive ? 'active' : 'neutral'} />
        <p style={{
          flex: 1, minWidth: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)',
          fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'baseline', gap: 6,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
          {contact.username && (
            <span style={{ fontSize: 12.5, fontWeight: 400, color: 'var(--arvo-fg-soft)', flexShrink: 0 }}>@{contact.username}</span>
          )}
        </p>
        {/* Saldo agregado de despesas divididas — soma finance_moment_expense_shares de
            TODOS os Momentos compartilhados com essa pessoa, não só um. Positivo = ela
            me deve, negativo = eu devo a ela (ver GET /people no backend). */}
        {(contact.balances ?? []).map(b => (
          <span
            key={b.currency}
            title={b.amount > 0 ? t.people.balanceTheyOweYou : t.people.balanceYouOweThem}
            style={{
              flexShrink: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 13, fontWeight: 600,
              color: b.amount > 0 ? '#1F8A5B' : RED,
            }}
          >
            {b.amount > 0 ? '+' : '−'}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: b.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(b.amount))}
          </span>
        ))}
        {/* Estado de amizade — "conectado" vira só um check verde (a pílula com
            texto ocupava espaço à toa pro caso mais comum); pendente continua
            como pílula com texto porque precisa chamar atenção. */}
        {friendState === 'connected' && (
          <span
            title={t.people.connectedTooltip}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 18, height: 18, borderRadius: 999, background: 'rgba(31,138,91,0.12)', color: '#1F8A5B' }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>
          </span>
        )}
        {(friendState === 'incoming' || friendState === 'outgoing') && (
          <span
            style={{
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
              padding: '3px 9px', borderRadius: 999,
              background: 'rgba(200,184,154,0.14)', color: GOLD, border: '1px solid rgba(200,184,154,0.30)',
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: 999, background: 'currentColor', flexShrink: 0 }} />
            {t.people.pending}
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--arvo-fg-soft)" strokeWidth="1.5" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 4.5L6 8l3.5-3.5" />
        </svg>
      </div>

      {pairModal && contact.user_id && (
        <PairMomentModal
          friendUserId={contact.user_id}
          friendName={displayName}
          friendAvatarUrl={contact.avatar_url}
          initialMomentId={pairModal.momentId}
          balancesByMoment={contact.balancesByMoment}
          sharedGroups={contact.contexts
            .filter((c): c is FinanceContext => c.type === 'shared_finance' && c.member_status === 'active')
            .map(c => ({ group_id: c.group_id, name: c.group_name }))}
          onClose={() => { setPairModal(null); onFriendChanged() }}
          onPromoted={onFriendChanged}
        />
      )}

      {!expanded ? null : (<>
      <p style={{
        fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 10,
      }}>
        {contact.email}
      </p>
      {/* Convite de amizade pendente recebido — ação principal, fica no topo
          do corpo expandido, fora das listas de recursos. */}
      {incomingPending && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(200,184,154,0.10)', border: '1px solid rgba(200,184,154,0.25)', marginBottom: 14 }}>
          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg-soft)', flex: 1 }}>
            {t.people.invitedYouConnect}
          </span>
          <button
            type="button" onClick={() => acceptFriend(incomingPending)} disabled={accepting}
            className="arvo-btn arvo-btn--primary" style={{ fontSize: 12, padding: '4px 12px' }}
          >
            {accepting ? '…' : t.people.accept}
          </button>
        </div>
      )}

      {/* Saldo de despesas divididas — soma finance_moment_expense_shares de todos os
          Momentos compartilhados; "Acertar contas" zera em CADA Momento pendente,
          não só aqui (ver POST /people/settle). */}
      {(contact.balances ?? []).length > 0 && contact.user_id && (
        <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 12, marginBottom: 4 }}>
          <p style={{
            fontFamily: 'var(--arvo-font-display)', fontSize: 12.5, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 6,
          }}>
            {t.people.sectionBalance}
          </p>
          {(contact.balances ?? []).map(b => (
            <div key={b.currency} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: b.amount > 0 ? '#1F8A5B' : RED, flex: 1 }}>
                {b.amount > 0
                  ? t.people.balanceTheyOweYouLine.replace('{amount}', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: b.currency }).format(Math.abs(b.amount)))
                  : t.people.balanceYouOweThemLine.replace('{amount}', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: b.currency }).format(Math.abs(b.amount)))}
              </span>
              <button
                type="button" onClick={() => settleUp()} disabled={settling}
                className="arvo-btn arvo-btn--ghost" style={{ fontSize: 10.5, padding: '3px 10px' }}
              >
                {settling ? '…' : t.people.settleUp}
              </button>
            </div>
          ))}
          {(contact.balancesByMoment ?? []).length > 0 && (
            <div style={{ marginTop: 4, paddingLeft: 2 }}>
              {(contact.balancesByMoment ?? []).map(m => {
                // 1:1 puro = is_pair_default sem grupo. Momento padrão de grupo também é
                // is_pair_default=true (mesma flag), mas tem shared_group_id e nome próprio
                // — deve navegar como um Momento normal, não abrir o modal do 1:1 oculto.
                const isPureOneOnOne = !!m.is_pair_default && m.shared_group_id == null
                return (
                <button
                  key={m.moment_id}
                  type="button"
                  onClick={() => isPureOneOnOne ? setPairModal({ momentId: m.moment_id }) : navigate(`/finances/moments/${m.moment_id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', width: '100%',
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg-soft)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isPureOneOnOne ? t.people.expensesWithPrefix : m.moment_name}
                  </span>
                  {m.balances.map(b => (
                    <span key={b.currency} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, fontWeight: 600, color: b.amount > 0 ? '#1F8A5B' : RED, flexShrink: 0 }}>
                      {b.amount > 0 ? '+' : '−'}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: b.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(b.amount))}
                    </span>
                  ))}
                </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Viagens */}
      {tripContexts.length > 0 && (
        <CollapsibleSection title={t.people.sectionTrips} count={tripContexts.length}>
          {tripContexts.map(ctx => (
            <ResourceRow
              key={ctx.member_id}
              icon={
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M1 11.5l3-7 4 3 3-5 4 3"/>
                  <path strokeLinecap="round" d="M1 14.5h14"/>
                </svg>
              }
              title={ctx.trip_title}
              role={ctx.role}
              status={ctx.member_status}
              ownedByMe={ctx.direction === 'owned_by_me'}
              onRemove={() => removeTrip(ctx)}
              onView={() => navigate(`/voyage/${ctx.trip_id}`)}
              removing={removing === ctx.member_id}
              pendingTitle={t.people.pending}
            />
          ))}
        </CollapsibleSection>
      )}

      {/* Finanças compartilhadas */}
      {financeContexts.length > 0 && (
        <CollapsibleSection title={t.people.sectionFinances} count={financeContexts.length}>
          {financeContexts.map(ctx => (
            <ResourceRow
              key={ctx.member_id}
              icon={
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="6.5"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v6M6 7h3a1 1 0 010 2H6"/>
                </svg>
              }
              title={ctx.group_name}
              status={ctx.member_status}
              ownedByMe={ctx.direction === 'owned_by_me'}
              onRemove={() => removeFinance(ctx)}
              onView={() => navigate('/finances/shared')}
              removing={removing === ctx.member_id}
              pendingTitle={t.people.pending}
            />
          ))}
        </CollapsibleSection>
      )}

      {/* Momentos compartilhados */}
      {momentContexts.length > 0 && (
        <CollapsibleSection title={t.people.sectionMoments} count={momentContexts.length}>
          {momentContexts.map(ctx => (
            <ResourceRow
              key={ctx.member_id}
              icon={
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.5l1.8 4.2 4.6.4-3.5 3 1 4.5L8 11.3l-3.9 2.3 1-4.5-3.5-3 4.6-.4z"/>
                </svg>
              }
              title={ctx.moment_name}
              role={ctx.role}
              status={ctx.member_status}
              ownedByMe={ctx.direction === 'owned_by_me'}
              onRemove={() => removeMoment(ctx)}
              onView={() => navigate(`/finances/moments/${ctx.moment_id}`)}
              removing={removing === ctx.member_id}
              pendingTitle={t.people.pending}
            />
          ))}
        </CollapsibleSection>
      )}

      {/* Compartilhar + dividir despesa — ações relacionadas a "fazer algo com
          essa pessoa", lado a lado; o botão de dividir despesa cria/reaproveita
          o momento 1:1 oculto por trás (ver POST /finances/moments/default-with/:id).
          Sem o nome no texto — já está óbvio de quem é o card. */}
      <div style={{ borderTop: '1px solid var(--arvo-border-soft)', marginTop: 14, paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: shareMode ? 10 : 0 }}>
          {isConnected && contact.user_id && (
            <button
              type="button"
              onClick={() => setPairModal({ momentId: null })}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--arvo-font-body)', fontSize: 13, letterSpacing: '0.02em',
                padding: '6px 14px', borderRadius: 999, background: 'none', border: '1px solid var(--arvo-border)',
                color: 'var(--arvo-fg-muted)', cursor: 'pointer',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 4.5h9M2 4.5l2.5-2.5M2 4.5l2.5 2.5M14 11.5H5M14 11.5l-2.5-2.5M14 11.5l-2.5 2.5"/>
              </svg>
              {t.people.splitExpenseButton}
            </button>
          )}
          {!shareMode && (
            <div style={{ position: 'relative' }}>
              <button
                type="button" onClick={() => setShowShareMenu(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--arvo-font-body)', fontSize: 13, letterSpacing: '0.02em',
                  padding: '6px 14px', borderRadius: 999, background: 'none', border: '1px solid var(--arvo-border)',
                  color: 'var(--arvo-fg-muted)', cursor: 'pointer',
                }}
              >
                {t.people.shareButton}
              </button>
              {showShareMenu && (
                <>
                  <div onClick={() => setShowShareMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, minWidth: 190,
                    background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 10,
                    boxShadow: 'var(--arvo-shadow-lg)', overflow: 'hidden',
                  }}>
                    {([
                      ['trip', t.people.shareTrip],
                      ['group', t.people.shareCategory],
                      ['moment', t.people.shareMoment],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode} type="button"
                        onClick={() => { setShareMode(mode); setShowShareMenu(false) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)' }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {shareMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={shareTarget}
              onChange={e => setShareTarget(e.target.value ? Number(e.target.value) : '')}
              style={{ flex: 1, fontSize: 13.5, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)' }}
            >
              <option value="">{shareMode === 'trip' ? t.people.selectTrip : shareMode === 'moment' ? t.people.selectMoment : t.people.selectCategory}</option>
              {(shareMode === 'trip' ? trips : shareMode === 'moment' ? moments : groups).map(item => (
                <option key={item.id} value={item.id}>{'title' in item ? item.title : item.name}</option>
              ))}
            </select>
            <button type="button" onClick={confirmShare} disabled={sharing || shareTarget === ''} className="arvo-btn arvo-btn--primary" style={{ fontSize: 12, padding: '5px 12px' }}>
              {sharing ? '…' : t.people.inviteCta}
            </button>
            <button type="button" onClick={() => { setShareMode(null); setShareError('') }} style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>
              {t.people.cancel}
            </button>
          </div>
        )}
        {shareError && <p style={{ fontSize: 12, color: RED, marginTop: 8 }}>{shareError}</p>}
      </div>

      {/* Auto-aceite — vale para qualquer convite (viagem, momento, categoria),
          não só compartilhamento; fica fora do bloco "Compartilhar" pra não parecer
          que é uma opção só de Momentos. */}
      {isConnected && contact.user_id && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '12px', borderRadius: 10, background: 'var(--arvo-hover-bg)' }}>
          <Switch
            label={t.people.autoAcceptLabel}
            checked={auto} disabled={togglingAutoAccept}
            onChange={() => toggleAutoAccept(mineFriendCtx ?? { type: 'friend', direction: 'owned_by_me', friend_id: 0, friend_status: 'active', auto_accept_invites: false })}
          />
          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', lineHeight: 1.4 }}>
            {t.people.autoAcceptLabel}
          </span>
        </div>
      )}

      {/* Remover pessoa — única ação que de fato desfaz a conexão (e revoga
          todo compartilhamento); separada das ações de "remover acesso a
          este recurso" (os × nas listas acima) pra não confundir as duas. */}
      {friendContexts.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--arvo-border-soft)' }}>
          <button
            type="button" onClick={() => unfriend(removableFriendCtx)}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 8, fontFamily: 'var(--arvo-font-body)', fontSize: 13,
              background: 'none', border: '1px solid rgba(214,59,47,0.30)', color: RED, cursor: 'pointer',
            }}
          >
            {t.people.removePersonButton}
          </button>
        </div>
      )}
      </>)}
    </div>
  )
}

// Painel de despesas do momento oculto do GRUPO — mesma ideia do PairMomentModal
// (1:1), só que cria/reaproveita o momento via POST /shared/groups/:id/default-moment
// e serve pra despesas avulsas com a galera do grupo, sem virar categoria de
// orçamento (ver docs/SHARED_EXPENSES_MODEL.md).
export function GroupExpensesModal({ groupId, groupName, initialMomentId, onClose }: {
  groupId: number
  groupName: string
  initialMomentId: number | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { currency, hideValues } = useCurrency()
  const [momentId, setMomentId] = useState<number | null>(initialMomentId)
  const [loading, setLoading] = useState(!initialMomentId)
  const [error, setError] = useState('')
  const [headerMeta, setHeaderMeta] = useState<MomentMeta | null>(null)
  const fmt = (n: number, c: string) => hideValues ? '•••' : _fmt(n, c)

  useEffect(() => {
    if (initialMomentId) return
    apiFetch<{ moment_id: number }>(`/shared/groups/${groupId}/default-moment`, { method: 'POST' })
      .then(r => setMomentId(r.moment_id))
      .catch((ex: unknown) => setError((ex as Error).message ?? t.people.loadErrorDefault))
      .finally(() => setLoading(false))
  }, [groupId, initialMomentId])

  const others = (headerMeta?.participants ?? []).filter(p => p.user_id !== user?.id)

  return (
    // Bottom-sheet no mobile, mesmo padrão do PairMomentModal (ver comentário lá).
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        className="relative w-full sm:max-w-[480px] max-h-[92vh] sm:max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{ background: 'var(--arvo-surface)', boxShadow: 'var(--arvo-shadow-lg)', padding: '20px 22px calc(28px + env(safe-area-inset-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {/* Pilha de avatares dos membros do grupo — mesmo padrão do PairMomentModal. */}
          {others.length > 0 && (
            <div className="flex -space-x-2" style={{ flexShrink: 0 }}>
              {others.slice(0, 3).map(p => (
                <div key={p.user_id} style={{ border: '2px solid var(--arvo-surface)', borderRadius: '50%' }}>
                  <Avatar name={p.name} email={p.email} avatarUrl={p.avatar_url} size={26} />
                </div>
              ))}
              {others.length > 3 && (
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--arvo-surface)',
                  background: 'var(--arvo-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--arvo-font-body)', fontSize: 11, fontWeight: 600, color: 'var(--arvo-fg-soft)',
                }}>
                  +{others.length - 3}
                </div>
              )}
            </div>
          )}
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)', flex: 1 }}>
            {t.people.expensesWithPrefix} {groupName}
          </p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path strokeLinecap="round" d="M1.5 1.5l11 11M12.5 1.5l-11 11" />
            </svg>
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-5"><ArvoLoader size={26} style={{ color: 'var(--arvo-gold)' }} /></div>
        ) : error ? (
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: RED }}>{error}</p>
        ) : momentId ? (
          <ExpensesPanel momentId={momentId} currency={currency} fmt={fmt} onMetaChange={setHeaderMeta} />
        ) : null}
      </div>
    </div>
  )
}

// Gerenciar membros do grupo — convite (já reaproveitando o InviteModal do
// Compartilhado) + lista com opção de remover. Fica em Amigos agora porque
// "quem está no meu círculo" é o assunto natural desta página, não do
// Planejamento (que só edita categoria/meta/% de divisão).
function ManageGroupModal({ group, userId, s, onClose, onChanged }: {
  group: SharedGroupFull
  userId: string
  s: Record<string, string>
  onClose: () => void
  onChanged: () => void
}) {
  const { t } = useI18n()
  // Grupo recém-criado (só eu como membro) já abre direto no convite — criar
  // um grupo sem convidar ninguém não serve pra nada.
  const [showInvite, setShowInvite] = useState(() => group.members.filter(m => m.status === 'active' && m.user_id !== userId).length === 0)
  const [inviteResult, setInviteResult] = useState<string | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(group.name)
  const [savingName, setSavingName] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const isOwner = group.created_by === userId

  async function removeMember(memberId: number) {
    setRemoving(memberId)
    try {
      await apiFetch(`/shared/groups/${group.id}/members/${memberId}`, { method: 'DELETE' })
      onChanged()
    } finally {
      setRemoving(null)
    }
  }

  async function saveName() {
    setEditingName(false)
    if (!nameInput.trim() || nameInput.trim() === group.name) { setNameInput(group.name); return }
    setSavingName(true)
    try {
      await apiFetch(`/shared/groups/${group.id}`, { method: 'PATCH', body: JSON.stringify({ name: nameInput.trim() }) })
      onChanged()
    } finally {
      setSavingName(false)
    }
  }

  async function deleteGroup() {
    if (!confirm(s.deleteGroupConfirm ?? 'Excluir este grupo?')) return
    setDeleting(true)
    try {
      await apiFetch(`/shared/groups/${group.id}`, { method: 'DELETE' })
      onChanged()
      onClose()
    } catch (e) {
      if (e instanceof Error && confirm(e.message)) {
        await apiFetch(`/shared/groups/${group.id}?force=true`, { method: 'DELETE' })
        onChanged()
        onClose()
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <ModalOverlay onClose={onClose}>
        <div className="flex flex-col gap-4">
          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setNameInput(group.name) } }}
              className="text-sm font-semibold px-2 py-1 rounded-lg border"
              style={{ color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.06em', borderColor: 'var(--arvo-border)', background: 'var(--arvo-surface)' }}
            />
          ) : (
            <h2
              className="text-sm font-semibold cursor-pointer"
              onClick={() => { setNameInput(group.name); setEditingName(true) }}
              style={{
                color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.06em',
                textDecoration: 'underline dotted', textDecorationColor: 'var(--arvo-fg-soft)', textUnderlineOffset: 3,
                opacity: savingName ? 0.5 : 1, width: 'fit-content',
              }}
              title={t.finances.clickToEditBudget}
            >
              {group.name}
            </h2>
          )}
          <div className="flex flex-col gap-2">
            {group.members.filter(m => m.status !== 'left').map(m => {
              const isMe = m.user_id === userId
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <Avatar name={m.display.name} email={m.display.email} avatarUrl={m.display.avatar_url} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--arvo-fg)' }}>
                      {m.display.name}{isMe ? <span className="font-normal text-xs ml-1" style={{ color: 'var(--arvo-fg-soft)' }}>({s.you ?? 'você'})</span> : ''}
                    </p>
                    {m.status === 'pending' && <p className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>{s.pending}</p>}
                  </div>
                  {!isMe && (
                    <button
                      onClick={() => removeMember(m.id)} disabled={removing === m.id}
                      className="text-xs px-2.5 py-1 rounded-lg"
                      style={{ color: RED, background: 'rgba(214,59,47,0.08)', opacity: removing === m.id ? 0.5 : 1 }}
                    >
                      {removing === m.id ? '…' : (s.remove ?? 'Remover')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex gap-2 justify-end">
            {isOwner && (
              <button
                type="button" onClick={deleteGroup} disabled={deleting}
                className="px-4 py-2 rounded-lg text-xs"
                style={{ color: RED, background: 'rgba(214,59,47,0.08)', opacity: deleting ? 0.5 : 1, marginRight: 'auto' }}
              >
                {deleting ? '…' : (s.deleteGroup ?? 'Excluir grupo')}
              </button>
            )}
            <button type="button" onClick={() => { setInviteResult(null); setShowInvite(true) }} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--arvo-fg)', color: 'var(--arvo-pill-active-fg)' }}>
              {s.invite}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--arvo-chip-bg)', color: 'var(--arvo-fg)' }}>
              {s.close ?? 'Fechar'}
            </button>
          </div>
          {/* Divisão de despesas — vale pro grupo inteiro (todas as categorias
              compartilhadas com ele), não só uma; fica recolhida porque a maioria
              das visitas a este modal é só invite/remove membro. */}
          <CollapsibleSection title={t.finances.editSplit} count={group.members.filter(m => m.status === 'active').length}>
            <div style={{ paddingTop: 4 }}>
              <GroupSplitSection groupId={group.id} members={group.members} userId={userId} onSaved={onChanged} />
            </div>
          </CollapsibleSection>
        </div>
      </ModalOverlay>
      {showInvite && (
        <InviteModal
          s={s}
          result={inviteResult}
          copied={false}
          onInvite={async payload => {
            const data = await apiFetch<{ direct?: boolean; invite_url?: string }>(`/shared/groups/${group.id}/invite`, { method: 'POST', body: JSON.stringify(payload) })
            if (!data.direct) setInviteResult(data.invite_url ?? null)
            onChanged()
            return { direct: !!data.direct }
          }}
          onCopy={() => { if (inviteResult) navigator.clipboard.writeText(inviteResult) }}
          onClose={() => { setShowInvite(false); setInviteResult(null) }}
        />
      )}
    </>
  )
}

// Seção "Grupos" — lista os shared_groups do usuário com saldo do momento oculto
// (despesas avulsas, real, liquidável) separado da meta de categoria (só
// referência, nunca vira dívida — ver docs/SHARED_EXPENSES_MODEL.md).
function GroupsSection({ fullGroups, onOpenExpenses, onManage, onNewGroup }: {
  fullGroups: SharedGroupFull[]
  onOpenExpenses: (group: SharedGroupFull) => void
  onManage: (group: SharedGroupFull) => void
  onNewGroup: () => void
}) {
  const { t } = useI18n()
  const { hideValues } = useCurrency()
  const fmt = (n: number, c: string) => hideValues ? '•••' : _fmt(n, c)

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 14, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', flex: 1 }}>
          {t.people.sectionGroups}
        </p>
        <button
          type="button" onClick={onNewGroup}
          style={{ fontSize: 13, fontFamily: 'var(--arvo-font-body)', padding: '5px 12px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg-muted)', cursor: 'pointer' }}
        >
          {t.people.newGroupButton}
        </button>
      </div>
      {fullGroups.length === 0 ? (
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg-soft)' }}>{t.people.noGroupsYet}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fullGroups.map(g => (
            <GroupCard key={g.id} group={g} fmt={fmt} onOpenExpenses={() => onOpenExpenses(g)} onManage={() => onManage(g)} />
          ))}
        </div>
      )}
    </div>
  )
}

// Card de grupo colapsado — só nome + avatares, igual ao card de amigo; os
// botões (dividir despesa, gerenciar) só aparecem expandido, senão o card já
// chega "cobrando" alguém antes mesmo do usuário decidir se quer interagir.
function GroupCard({ group: g, fmt, onOpenExpenses, onManage }: {
  group: SharedGroupFull
  fmt: (n: number, c: string) => string
  onOpenExpenses: () => void
  onManage: () => void
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const activeMembers = g.members.filter(m => m.status === 'active')

  return (
    <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
      <div
        role="button" tabIndex={0}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(v => !v) }}
        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', flex: '0 0 auto' }}>
          {activeMembers.slice(0, 4).map(m => (
            <div key={m.id} style={{ marginLeft: -6, border: '2px solid var(--arvo-surface)', borderRadius: '50%' }}>
              <Avatar name={m.display.name} email={m.display.email} avatarUrl={m.display.avatar_url} size={24} />
            </div>
          ))}
        </div>
        <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {g.name}
        </span>
        {(g.balance ?? []).map(b => (
          <span key={b.currency} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, fontWeight: 600, color: b.amount > 0 ? '#1F8A5B' : RED, flexShrink: 0 }}>
            {b.amount > 0 ? '+' : '−'}{fmt(Math.abs(b.amount), b.currency)}
          </span>
        ))}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--arvo-fg-soft)" strokeWidth="1.5" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 4.5L6 8l3.5-3.5" />
        </svg>
      </div>
      {expanded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--arvo-border-soft)' }}>
          <button
            type="button" onClick={onOpenExpenses}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--arvo-font-body)', fontSize: 13, letterSpacing: '0.02em',
              padding: '5px 12px', borderRadius: 999, background: 'none', border: '1px solid var(--arvo-border)',
              color: 'var(--arvo-fg-muted)', cursor: 'pointer',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 4.5h9M2 4.5l2.5-2.5M2 4.5l2.5 2.5M14 11.5H5M14 11.5l-2.5-2.5M14 11.5l-2.5 2.5"/>
            </svg>
            {t.people.splitExpenseButton}
          </button>
          <button
            type="button" onClick={onManage}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--arvo-font-body)', fontSize: 13,
              padding: '5px 12px', borderRadius: 999, background: 'none', border: '1px solid var(--arvo-border)', cursor: 'pointer', color: 'var(--arvo-fg-soft)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a1 1 0 110-2 1 1 0 010 2zm0 5a1 1 0 110-2 1 1 0 010 2zm0 5a1 1 0 110-2 1 1 0 010 2z"/></svg>
            {t.people.manageGroupButton}
          </button>
        </div>
      )}
    </div>
  )
}

// Lê o cache de contatos da última visita pra a página já renderizar com esses
// dados (mesmo que levemente desatualizados) em vez de mostrar o skeleton toda
// vez — `load()` revalida em seguida e substitui assim que a resposta chegar.
function cachedContacts(): Contact[] {
  try {
    const raw = sessionStorage.getItem('arvo_people_cache')
    return raw ? JSON.parse(raw) as Contact[] : []
  } catch { return [] }
}

export default function PeoplePage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>(cachedContacts)
  const [trips, setTrips]   = useState<Trip[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [moments, setMoments] = useState<MomentOption[]>([])
  const [loading, setLoading]   = useState(() => cachedContacts().length === 0)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loadError, setLoadError] = useState('')
  // Grupos de categoria compartilhada — carregados com detalhe completo (membros,
  // saldo do momento oculto) pra alimentar a nova seção "Grupos" desta página;
  // `groups` continua só com {id,name} pra não quebrar o seletor de "Compartilhar".
  const [fullGroups, setFullGroups] = useState<SharedGroupFull[]>([])
  const [groupModal, setGroupModal] = useState<'new' | SharedGroupFull | null>(null)
  const [manageGroupId, setManageGroupId] = useState<number | null>(null)
  const [groupExpenseModal, setGroupExpenseModal] = useState<{ groupId: number; momentId: number | null } | null>(null)

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const data = await apiFetch<{ contacts: Contact[] }>('/people')
      setContacts(data.contacts)
      try { sessionStorage.setItem('arvo_people_cache', JSON.stringify(data.contacts)) } catch { /* quota/incognito — ignora */ }
    } catch (ex: unknown) {
      setLoadError((ex as Error).message ?? t.people.loadErrorDefault)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadGroups = useCallback(async () => {
    try {
      const gs = await apiFetch<SharedGroupFull[]>('/shared/groups')
      setFullGroups(gs)
      setGroups(gs.map(g => ({ id: g.id, name: g.name })))
    } catch { /* silencioso — não é crítico pro resto da página */ }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    apiFetch<{ trips: Trip[] }>('/voyage/trips').then(r => setTrips(r.trips)).catch(() => {})
    loadGroups()
    apiFetch<MomentOption[]>('/finances/moments-for-picker').then(setMoments).catch(() => {})
  }, [loadGroups])

  const isEmailLike = /\S+@\S+\.\S+/.test(inviteEmail)

  useEffect(() => {
    const query = inviteEmail.trim().replace(/^@/, '')
    if (isEmailLike || query.length < 2) { setSuggestions([]); return }
    const handle = setTimeout(() => {
      apiFetch<UserSuggestion[]>(`/people/search?q=${encodeURIComponent(query)}`)
        .then(r => { setSuggestions(r); setShowSuggestions(true) })
        .catch(() => setSuggestions([]))
    }, 300)
    return () => clearTimeout(handle)
  }, [inviteEmail, isEmailLike])

  async function sendInvite(payload: { email?: string; username?: string }) {
    setInviting(true)
    setInviteError('')
    try {
      await apiFetch('/people/invite', { method: 'POST', body: JSON.stringify(payload) })
      setInviteEmail('')
      setSuggestions([])
      setShowSuggestions(false)
      load()
    } catch (ex: unknown) {
      setInviteError((ex as Error).message ?? t.people.inviteErrorDefault)
    } finally {
      setInviting(false)
    }
  }

  function pickSuggestion(s: UserSuggestion) {
    sendInvite({ username: s.username })
  }

  function handleInvite(e: FormEvent) {
    e.preventDefault()
    if (isEmailLike) { sendInvite({ email: inviteEmail.trim() }); return }
    const username = inviteEmail.trim().replace(/^@/, '')
    if (username.length < 3) return
    sendInvite({ username })
  }

  function handleRemoved(memberId: number) {
    setContacts(prev =>
      prev
        .map(c => ({ ...c, contexts: c.contexts.filter(ctx => !('member_id' in ctx) || ctx.member_id !== memberId) }))
        .filter(c => c.contexts.length > 0)
    )
  }

  const activeCount  = contacts.filter(c => c.status === 'active').length
  const pendingCount = contacts.filter(c => c.status === 'pending').length

  return (
    <div className="max-w-2xl mx-auto px-4 2xl:px-8 py-6">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{
          fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.30em',
          textTransform: 'uppercase', color: RED, marginBottom: 6,
        }}>
          ARVO
        </p>
        <h1 style={{
          fontFamily: 'var(--arvo-font-display)', fontSize: 28, letterSpacing: '0.08em',
          color: 'var(--arvo-fg)', marginBottom: 10,
        }}>
          {t.nav.people}
        </h1>
        {!loading && contacts.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {activeCount > 0 && (
              <span style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: '#1F8A5B',
                background: 'rgba(31,138,91,0.08)', padding: '2px 10px', borderRadius: 999,
                border: '1px solid rgba(31,138,91,0.16)',
              }}>
                {(activeCount === 1 ? t.people.nActiveOne : t.people.nActiveMany).replace('{n}', String(activeCount))}
              </span>
            )}
            {pendingCount > 0 && (
              <span style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: GOLD,
                background: 'rgba(200,184,154,0.10)', padding: '2px 10px', borderRadius: 999,
                border: '1px solid rgba(200,184,154,0.20)',
              }}>
                {(pendingCount === 1 ? t.people.nPendingOne : t.people.nPendingMany).replace('{n}', String(pendingCount))}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Convidar amigo */}
      <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, marginBottom: 8, position: 'relative' }}>
        <input
          type="text" required placeholder={t.people.inviteFormPlaceholder}
          value={inviteEmail}
          onChange={e => setInviteEmail(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          style={{
            flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 14, padding: '8px 12px',
            borderRadius: 8, border: '1px solid var(--arvo-border)',
            background: 'var(--arvo-surface)', color: 'var(--arvo-fg)',
          }}
        />
        <button type="submit" disabled={inviting} className="arvo-btn arvo-btn--primary arvo-btn--sm" style={{ flexShrink: 0 }}>
          {inviting ? '…' : t.people.inviteFormButton}
        </button>

        {showSuggestions && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 90, marginTop: 4, zIndex: 10,
            background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
            borderRadius: 10, boxShadow: 'var(--arvo-shadow-sm)', overflow: 'hidden',
          }}>
            {suggestions.map(s => (
              <button
                type="button" key={s.user_id}
                onClick={() => pickSuggestion(s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                <Avatar name={s.name} avatarUrl={s.avatar_url} size={28} />
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)' }}>
                  {s.name || `@${s.username}`}
                </span>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)' }}>
                  @{s.username}
                </span>
              </button>
            ))}
          </div>
        )}
      </form>
      {inviteError && <p style={{ fontSize: 13, color: RED, marginBottom: 16 }}>{inviteError}</p>}

      <GroupsSection
        fullGroups={fullGroups}
        onOpenExpenses={g => setGroupExpenseModal({ groupId: g.id, momentId: g.default_moment_id ?? null })}
        onManage={g => setManageGroupId(g.id)}
        onNewGroup={() => setGroupModal('new')}
      />
      {groupModal && (
        <GroupModal
          s={t.shared}
          initial={groupModal === 'new' ? undefined : groupModal}
          onClose={() => setGroupModal(null)}
          onSaved={async id => {
            setGroupModal(null)
            await loadGroups()
            // Grupo novo: já cai direto em "Gerenciar" (convite + divisão), já
            // que criar um grupo sem convidar ninguém não serve pra nada.
            if (id) setManageGroupId(id)
          }}
        />
      )}
      {manageGroupId && (() => {
        const g = fullGroups.find(x => x.id === manageGroupId)
        return g ? (
          <ManageGroupModal
            group={g}
            userId={user?.id ?? ''}
            s={t.shared}
            onClose={() => setManageGroupId(null)}
            onChanged={loadGroups}
          />
        ) : null
      })()}
      {groupExpenseModal && (
        <GroupExpensesModal
          groupId={groupExpenseModal.groupId}
          groupName={fullGroups.find(g => g.id === groupExpenseModal.groupId)?.name ?? ''}
          initialMomentId={groupExpenseModal.momentId}
          onClose={() => { setGroupExpenseModal(null); loadGroups() }}
        />
      )}

      {loadError ? (
        <div style={{
          padding: '16px 18px', borderRadius: 10, border: '1px solid rgba(214,59,47,0.25)',
          background: 'rgba(214,59,47,0.06)', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: RED }}>
            {t.people.loadErrorPrefix} {loadError}
          </p>
          <button type="button" onClick={() => load()} className="arvo-btn arvo-btn--primary" style={{ alignSelf: 'flex-start', fontSize: 13 }}>
            {t.people.retry}
          </button>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map(i => (
            <div key={i} style={{
              height: 160, borderRadius: 14,
              background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite',
            }} />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: 320, gap: 16,
        }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="rgba(200,184,154,0.30)" strokeWidth="1.4">
            <circle cx="19" cy="17" r="7"/>
            <path strokeLinecap="round" d="M4 42c0-8.3 6.7-15 15-15"/>
            <circle cx="34" cy="19" r="5.5"/>
            <path strokeLinecap="round" d="M44 42c0-5.5-4.5-10-10-10"/>
          </svg>
          <p style={{
            fontFamily: 'var(--arvo-font-display)', fontSize: 20, letterSpacing: '0.06em',
            color: 'var(--arvo-fg-muted)', textAlign: 'center',
          }}>
            {t.people.emptyTitle}
          </p>
          <p style={{
            fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14,
            color: GOLD, textAlign: 'center', maxWidth: 300, lineHeight: 1.6,
          }}>
            {t.people.emptyBody}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 14, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: -2 }}>
            {t.nav.people}
          </p>
          {contacts.map((contact, i) => (
            <div key={contact.email} style={{ animation: 'fadeUp 320ms cubic-bezier(0.22,0.61,0.36,1) both', animationDelay: `${i * 50}ms` }}>
              <ContactCard contact={contact} trips={trips} groups={groups} moments={moments} onRemoved={handleRemoved} onFriendChanged={() => { invalidateActiveFriends(); (load)() }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
