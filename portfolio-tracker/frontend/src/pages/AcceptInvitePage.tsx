import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import ArvoLoader from '../components/ArvoLoader'

interface InvitePreview {
  group_name: string
  inviter_name: string
  inviter_avatar?: string
  status: string
}

const F_SANS = "'DM Sans', system-ui, sans-serif"

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const s = t.shared

  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) return
    // Fetch preview without auth
    fetch(`/api/shared/invite/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setPreview(data)
      })
      .catch(() => setError('Erro ao carregar convite'))
      .finally(() => setLoadingPreview(false))
  }, [token])

  async function handleAccept() {
    if (!user) {
      // Store token in session and redirect to login
      sessionStorage.setItem('pending_invite_token', token ?? '')
      navigate('/login', { replace: true })
      return
    }
    setAccepting(true)
    try {
      await apiFetch('/shared/invite/accept', { method: 'POST', body: JSON.stringify({ token }) })
      setDone(true)
      setTimeout(() => navigate('/finances/shared'), 1800)
    } catch (ex: unknown) {
      setError((ex as Error).message ?? 'Erro ao aceitar convite')
    } finally {
      setAccepting(false)
    }
  }

  // After login, auto-accept if pending token
  useEffect(() => {
    if (!user || authLoading) return
    const pending = sessionStorage.getItem('pending_invite_token')
    if (pending && pending === token) {
      sessionStorage.removeItem('pending_invite_token')
      handleAccept()
    }
  }, [user, authLoading])

  if (loadingPreview || authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-offwhite)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <ArvoLoader size={40} style={{ color: 'var(--arvo-gold)' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-offwhite)', padding: 'calc(env(safe-area-inset-top, 0px) + 32px) 16px 32px', fontFamily: F_SANS }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'white', borderRadius: 16, border: '1px solid var(--arvo-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

        {/* Header band */}
        <div style={{ background: 'var(--arvo-black)', padding: '24px 24px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/brand/logo/arvo-symbol-gold.svg" width="20" height="21" alt="" />
          <span style={{ fontFamily: "'DM Sans', system-ui", fontSize: 14, letterSpacing: '0.28em', color: 'var(--arvo-gold)' }}>arvo</span>
        </div>

        <div style={{ padding: '28px 28px 24px' }}>
          {error ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(214,59,47,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 22, height: 22, color: 'var(--arvo-red)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <p style={{ fontSize: 14, color: 'var(--arvo-black)', fontWeight: 600 }}>{s.inviteExpired}</p>
              <p style={{ fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{error}</p>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(31,138,91,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 22, height: 22, color: 'var(--arvo-green)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p style={{ fontSize: 14, color: 'var(--arvo-black)', fontWeight: 600 }}>{s.alreadyMember || 'Bem-vindo ao grupo!'}</p>
              <p style={{ fontSize: 12, color: 'var(--arvo-fg-soft)' }}>Redirecionando...</p>
            </div>
          ) : preview && (
            <div className="flex flex-col gap-5">
              {/* Inviter */}
              <div className="flex flex-col items-center gap-3 text-center">
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(13,13,13,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                  👥
                </div>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: 'var(--arvo-font-body)', marginBottom: 4 }}>
                    {s.inviteFrom} {preview.inviter_name}
                  </p>
                  <p style={{ fontSize: 20, fontFamily: "'Tenor Sans', 'Times New Roman', serif", letterSpacing: '0.04em', color: 'var(--arvo-black)' }}>
                    {preview.group_name}
                  </p>
                </div>
              </div>

              {!user && (
                <p style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', textAlign: 'center', padding: '8px 0', borderTop: '1px solid var(--arvo-border-soft)', borderBottom: '1px solid var(--arvo-border-soft)' }}>
                  {s.loginToAccept}
                </p>
              )}

              <button
                onClick={handleAccept}
                disabled={accepting}
                style={{ width: '100%', padding: '13px 24px', background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', border: 'none', borderRadius: 8, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', opacity: accepting ? 0.6 : 1 }}
              >
                {accepting ? '...' : s.joinGroup}
              </button>

              <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--arvo-fg-soft)', cursor: 'pointer', textAlign: 'center' }}>
                {s.cancel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
