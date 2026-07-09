// HTTP client que injeta JWT do Supabase em todas as chamadas ao backend
import { supabase } from './supabase'

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

// Erro rico que preserva o corpo JSON do backend. `message` continua sendo a
// string `error` (compatível com todos os `catch(e => e.message === ...)`
// existentes), mas o payload completo fica em `.body` — usado pela
// interceptação de upgrade_required (ver UpgradeContext.handleUpgradeError).
export class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken()
  const locale = localStorage.getItem('portfolio-locale') ?? 'pt'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Locale': locale,
    ...(init?.headers as Record<string, string> ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const base = import.meta.env.VITE_API_BASE_URL ?? ''
  const res = await fetch(`${base}/api${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>
    throw new ApiError((body.error as string) ?? `HTTP ${res.status}`, res.status, body)
  }
  return res.json() as Promise<T>
}
