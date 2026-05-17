import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'

interface BankConnection {
  id: number
  provider: string
  provider_user_id: string | null
  display_name: string | null
  currency: string | null
  last_synced_at: string | null
  created_at: string
}

function relativeTime(iso: string | null) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)   return 'agora mesmo'
  if (mins < 60)  return `${mins}m atrás`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h atrás`
  return `${Math.floor(hrs / 24)}d atrás`
}

export default function FinancesAccountsPage() {
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const [connections, setConnections] = useState<BankConnection[]>([])
  const [loading,     setLoading]     = useState(true)
  const [connecting,  setConnecting]  = useState(false)
  const [syncing,     setSyncing]     = useState<number | null>(null)
  const [syncResult,  setSyncResult]  = useState<{ id: number; imported: number } | null>(null)
  const [banner,      setBanner]      = useState<'connected' | 'error' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<BankConnection[]>('/banks/connections')
      setConnections(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (searchParams.get('connected') === '1') setBanner('connected')
    if (searchParams.get('error'))             setBanner('error')
  }, [searchParams])

  async function connectBank() {
    setConnecting(true)
    try {
      const { url } = await apiFetch<{ url: string }>('/banks/auth')
      window.location.href = url
    } catch {
      setConnecting(false)
    }
  }

  async function syncConnection(id: number) {
    setSyncing(id)
    setSyncResult(null)
    try {
      const result = await apiFetch<{ imported: number; total: number }>(`/banks/sync/${id}`, { method: 'POST' })
      setSyncResult({ id, imported: result.imported })
      await load()
    } finally {
      setSyncing(null)
    }
  }

  async function disconnect(id: number) {
    if (!confirm(t.finances.disconnect + '?')) return
    await apiFetch(`/banks/connections/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t.finances.banksTitle}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t.finances.banksSubtitle}</p>
        </div>
        <button
          onClick={connectBank}
          disabled={connecting}
          className="px-3 py-1.5 bg-[#001A70] text-white text-sm rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50"
        >
          {connecting ? '…' : t.finances.connectBank}
        </button>
      </div>

      {/* Banner */}
      {banner === 'connected' && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <span>✅</span>
          <span>Conta conectada com sucesso! Clique em <strong>Sincronizar</strong> para importar as transações.</span>
          <button onClick={() => setBanner(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">×</button>
        </div>
      )}
      {banner === 'error' && (
        <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <span>⚠️</span>
          <span>Erro ao conectar. Tente novamente.</span>
          <button onClick={() => setBanner(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
          {t.common.loading}
        </div>
      )}

      {/* Empty state */}
      {!loading && connections.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-4xl mb-4">🏦</p>
          <p className="text-gray-700 font-medium mb-1">{t.finances.banksEmpty}</p>
          <p className="text-sm text-gray-400 mb-5">{t.finances.banksEmptyBody}</p>
          <button
            onClick={connectBank}
            disabled={connecting}
            className="px-5 py-2 bg-[#001A70] text-white text-sm rounded-xl hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {connecting ? '…' : t.finances.connectBank}
          </button>
        </div>
      )}

      {/* Connections list */}
      {!loading && connections.length > 0 && (
        <div className="space-y-3">
          {connections.map(conn => (
            <div key={conn.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#001A70]/10 flex items-center justify-center text-xl shrink-0">
                  🏦
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{conn.display_name ?? 'Conta conectada'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {conn.currency && <span className="mr-2">{conn.currency}</span>}
                    {conn.last_synced_at
                      ? `${t.finances.lastSync}: ${relativeTime(conn.last_synced_at)}`
                      : 'Nunca sincronizado'}
                  </p>
                  {syncResult?.id === conn.id && (
                    <p className="text-xs text-emerald-600 mt-0.5">
                      {syncResult.imported} {t.finances.importedN}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => syncConnection(conn.id)}
                    disabled={syncing === conn.id}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {syncing === conn.id ? t.finances.syncing : t.finances.syncNow}
                  </button>
                  <button
                    onClick={() => disconnect(conn.id)}
                    className="px-3 py-1.5 text-xs border border-red-100 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                  >
                    {t.finances.disconnect}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">Bancos suportados</p>
        <p>Revolut, Monzo, BNP Paribas, Société Générale, LCL, CIC e +3500 bancos europeus via TrueLayer.</p>
        <p className="text-blue-500">As credenciais bancárias nunca passam pelos nossos servidores. A conexão é feita diretamente via OAuth com o seu banco.</p>
      </div>
    </div>
  )
}
