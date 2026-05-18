import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'

const router = Router()

const isSandbox = (process.env.TRUELAYER_CLIENT_ID ?? '').startsWith('sandbox-')
const TL_AUTH = isSandbox ? 'https://auth.truelayer-sandbox.com' : 'https://auth.truelayer.com'
const TL_API  = isSandbox ? 'https://api.truelayer-sandbox.com'  : 'https://api.truelayer.com'

function createState(userId: string): string {
  const payload = `${userId}:${Date.now()}`
  const sig = crypto.createHmac('sha256', process.env.TRUELAYER_CLIENT_SECRET ?? 'dev')
    .update(payload).digest('hex').slice(0, 16)
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

function verifyState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString()
    const parts = decoded.split(':')
    if (parts.length < 3) return null
    const sig = parts.pop()!
    const payload = parts.join(':')
    const ts = parts[1]
    if (Date.now() - Number(ts) > 15 * 60 * 1000) return null
    const expected = crypto.createHmac('sha256', process.env.TRUELAYER_CLIENT_SECRET ?? 'dev')
      .update(payload).digest('hex').slice(0, 16)
    return sig === expected ? parts[0] : null
  } catch { return null }
}

function getRedirectUri(req: Request): string {
  if (process.env.TRUELAYER_REDIRECT_URI) return process.env.TRUELAYER_REDIRECT_URI
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0].trim() ?? req.protocol
  return `${proto}://${req.get('host')}/api/banks/callback`
}

// GET /api/banks/config — diagnóstico público (sem credenciais sensíveis)
router.get('/config', async (req, res: Response) => {
  const ruri = getRedirectUri(req)
  res.json({
    redirect_uri: ruri,
    client_id_prefix: (process.env.TRUELAYER_CLIENT_ID ?? '').slice(0, 20) || '(não definido)',
    is_sandbox: isSandbox,
    env_redirect_uri_set: !!process.env.TRUELAYER_REDIRECT_URI,
    env_redirect_uri_value: process.env.TRUELAYER_REDIRECT_URI || '(vazio — usando fallback dinâmico)',
    host: req.get('host'),
    x_forwarded_proto: req.headers['x-forwarded-proto'] ?? '(não presente)',
    req_protocol: req.protocol,
  })
})

// GET /api/banks/auth — generate TrueLayer auth URL
router.get('/auth', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  if (!process.env.TRUELAYER_CLIENT_ID) {
    res.status(503).json({ error: 'TrueLayer not configured' }); return
  }
  const state = createState(userId)
  const ruri  = getRedirectUri(req)
  const url = new URL(`${TL_AUTH}/`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', process.env.TRUELAYER_CLIENT_ID)
  url.searchParams.set('scope', 'info accounts balance transactions offline_access')
  url.searchParams.set('redirect_uri', ruri)
  url.searchParams.set('state', state)
  if (isSandbox) {
    url.searchParams.set('enable_mock', 'true')
    url.searchParams.set('enable_oauth_providers', 'false')
    url.searchParams.set('enable_open_banking_providers', 'false')
    url.searchParams.set('enable_credentials_sharing_providers', 'false')
  } else {
    url.searchParams.set('providers', 'ob-revolut ob-monzo uk-ob-all ie-ob-all fr-ob-all')
  }
  res.json({ url: url.toString(), _debug_redirect_uri: ruri })
})

// GET /api/banks/callback — TrueLayer OAuth callback
router.get('/callback', async (req, res: Response) => {
  const { code, state, error: tlError } = req.query as Record<string, string>
  const frontend = (process.env.FRONTEND_ORIGIN ?? '').split(',')[0].trim() || 'http://localhost:5174'

  if (tlError || !code || !state) {
    res.redirect(`${frontend}/finances/accounts?error=cancelled`); return
  }

  const userId = verifyState(state)
  if (!userId) { res.redirect(`${frontend}/finances/accounts?error=invalid_state`); return }

  const ruri = getRedirectUri(req)
  const tokenRes = await fetch(`${TL_AUTH}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.TRUELAYER_CLIENT_ID!,
      client_secret: process.env.TRUELAYER_CLIENT_SECRET!,
      redirect_uri: ruri,
      code,
    }),
  })

  if (!tokenRes.ok) {
    console.error('TrueLayer token error:', await tokenRes.text())
    res.redirect(`${frontend}/finances/accounts?error=token`); return
  }

  const tokens = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number }
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  const accountsRes = await fetch(`${TL_API}/data/v1/accounts`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (accountsRes.ok) {
    const { results } = await accountsRes.json() as { results: { account_id: string; display_name: string; currency: string }[] }
    for (const acc of results) {
      await supabaseAdmin.from('finance_bank_connections').upsert({
        user_id: userId, provider: 'truelayer',
        provider_user_id: acc.account_id, display_name: acc.display_name,
        currency: acc.currency, access_token: tokens.access_token,
        refresh_token: tokens.refresh_token, token_expires_at: expiresAt,
      }, { onConflict: 'user_id,provider,provider_user_id' })
    }
  } else {
    await supabaseAdmin.from('finance_bank_connections').insert({
      user_id: userId, provider: 'truelayer',
      access_token: tokens.access_token, refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
    })
  }

  res.redirect(`${frontend}/finances/accounts?connected=1`)
})

// GET /api/banks/connections
router.get('/connections', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('finance_bank_connections')
    .select('id, provider, provider_user_id, display_name, currency, last_synced_at, created_at')
    .eq('user_id', userId).order('created_at')
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// POST /api/banks/sync/:id — fetch & import transactions from TrueLayer
router.post('/sync/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const connId = Number(req.params.id)

  const { data: conn, error: connErr } = await supabaseAdmin
    .from('finance_bank_connections').select('*').eq('id', connId).eq('user_id', userId).single()
  if (connErr || !conn) { res.status(404).json({ error: 'Connection not found' }); return }

  let accessToken: string = conn.access_token

  // Refresh token if expiring in < 60s
  if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date(Date.now() + 60_000)) {
    const tr = await fetch(`${TL_AUTH}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.TRUELAYER_CLIENT_ID!,
        client_secret: process.env.TRUELAYER_CLIENT_SECRET!,
        refresh_token: conn.refresh_token,
      }),
    })
    if (tr.ok) {
      const nt = await tr.json() as { access_token: string; refresh_token: string; expires_in: number }
      accessToken = nt.access_token
      await supabaseAdmin.from('finance_bank_connections').update({
        access_token: nt.access_token, refresh_token: nt.refresh_token,
        token_expires_at: new Date(Date.now() + nt.expires_in * 1000).toISOString(),
      }).eq('id', connId)
    }
  }

  const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const to   = new Date().toISOString().slice(0, 10)
  const accountId = conn.provider_user_id

  const txRes = await fetch(
    `${TL_API}/data/v1/accounts/${accountId}/transactions?from=${from}&to=${to}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!txRes.ok) { res.status(502).json({ error: 'TrueLayer fetch failed' }); return }

  const { results: tlTxns } = await txRes.json() as {
    results: { transaction_id: string; timestamp: string; description: string; amount: number; currency: string }[]
  }

  let imported = 0
  for (const tx of tlTxns) {
    const source = `truelayer:${tx.transaction_id}`
    const { error } = await supabaseAdmin.from('finance_transactions').insert({
      user_id: userId, date: tx.timestamp.slice(0, 10),
      description: tx.description, amount: tx.amount,
      currency: tx.currency, source,
    })
    if (!error) imported++
  }

  await supabaseAdmin.from('finance_bank_connections')
    .update({ last_synced_at: new Date().toISOString() }).eq('id', connId)

  res.json({ imported, total: tlTxns.length })
})

// DELETE /api/banks/connections/:id
router.delete('/connections/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const connId = Number(req.params.id)
  const { error } = await supabaseAdmin
    .from('finance_bank_connections').delete().eq('id', connId).eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

export default router
