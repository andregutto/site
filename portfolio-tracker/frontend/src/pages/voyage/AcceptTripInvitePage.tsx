import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { apiFetch } from '../../lib/api'
import ArvoLoader from '../../components/ArvoLoader'

const RED = '#D63B2F'
const GREEN = '#1F8A5B'

interface TripInvitePreview {
  trip_title: string
  inviter_name: string
  status: string
}

export default function AcceptTripInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const iv = t.invite

  const [preview, setPreview] = useState<TripInvitePreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/voyage/invite/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setPreview(data)
      })
      .catch(() => setError(iv.loadError))
      .finally(() => setLoadingPreview(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleAccept() {
    if (!user) {
      sessionStorage.setItem('pending_trip_invite_token', token ?? '')
      navigate('/login', { replace: true })
      return
    }
    setAccepting(true)
    try {
      const result = await apiFetch<{ trip_id: number }>('/voyage/invite/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      })
      setDone(true)
      setTimeout(() => navigate(`/voyage/${result.trip_id}`), 1800)
    } catch (ex: unknown) {
      setError((ex as Error).message ?? iv.acceptError)
    } finally {
      setAccepting(false)
    }
  }

  useEffect(() => {
    if (!user || authLoading) return
    const pending = sessionStorage.getItem('pending_trip_invite_token')
    if (pending && pending === token) {
      sessionStorage.removeItem('pending_trip_invite_token')
      handleAccept()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  if (loadingPreview || authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-offwhite)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <ArvoLoader size={40} style={{ color: 'var(--arvo-gold)' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-offwhite)', padding: 'calc(env(safe-area-inset-top, 0px) + 32px) 16px 32px' }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'white', borderRadius: 16, border: '1px solid var(--arvo-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: 'var(--arvo-black)', padding: '24px 24px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/brand/logo/arvo-symbol-gold.svg" width="20" height="21" alt="" />
          <span style={{ fontFamily: "'DM Sans', system-ui", fontSize: 14, letterSpacing: '0.28em', color: 'var(--arvo-gold)' }}>arvo voyage</span>
        </div>

        <div style={{ padding: '28px 28px 24px' }}>
          {error ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(214,59,47,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 22, height: 22, color: RED }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <p style={{ fontSize: 14, color: 'var(--arvo-black)', fontWeight: 600 }}>{iv.invalidTitle}</p>
              <p style={{ fontSize: 14, color: 'var(--arvo-fg-soft)' }}>{error}</p>
            </div>
          ) : done ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(31,138,91,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 22, height: 22, color: 'var(--arvo-green)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p style={{ fontSize: 14, color: 'var(--arvo-black)', fontWeight: 600 }}>{iv.welcomeTrip}</p>
              <p style={{ fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{iv.redirecting}</p>
            </div>
          ) : preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(214,59,47,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 17l6-11 8 6 6-10 6 5"/>
                    <path strokeLinecap="round" d="M2 21h20"/>
                  </svg>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: 'var(--arvo-font-body)', marginBottom: 4 }}>
                    {iv.invitedBy.replace('{name}', preview.inviter_name)}
                  </p>
                  <p style={{ fontSize: 20, fontFamily: "'Tenor Sans', 'Times New Roman', serif", letterSpacing: '0.04em', color: 'var(--arvo-black)' }}>
                    {preview.trip_title}
                  </p>
                </div>
              </div>

              {!user && (
                <p style={{ fontSize: 13, color: 'var(--arvo-fg-soft)', textAlign: 'center', padding: '8px 0', borderTop: '1px solid var(--arvo-border-soft)', borderBottom: '1px solid var(--arvo-border-soft)' }}>
                  {iv.loginToAccept}
                </p>
              )}

              <button
                onClick={handleAccept}
                disabled={accepting}
                style={{ width: '100%', padding: '10px 0', borderRadius: 8, background: GREEN, color: '#fff', border: 'none', cursor: accepting ? 'default' : 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, opacity: accepting ? 0.7 : 1, transition: 'opacity 160ms' }}
              >
                {accepting ? '...' : iv.acceptTrip}
              </button>

              <button
                onClick={() => navigate('/')}
                style={{ width: '100%', padding: '8px 0', borderRadius: 8, background: 'none', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-muted)', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 13.5 }}
              >
                {iv.cancel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
