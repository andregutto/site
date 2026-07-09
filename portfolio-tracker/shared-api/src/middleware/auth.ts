// v9
import { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'

export interface AuthRequest extends Request {
  userId: string
  jwt: string
  userLocale: string
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    res.status(401).json({ error: 'Token de autenticação ausente' })
    return
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) {
      res.status(401).json({ error: 'Token inválido ou expirado' })
      return
    }
    // Corte de sessão viva: getUser já traz `banned_until`, então bloqueamos
    // sem round-trip extra. Uma conta banida ainda tem JWT válido até expirar —
    // aqui garantimos que qualquer request dela pare imediatamente.
    const bannedUntil = (user as { banned_until?: string }).banned_until
    if (bannedUntil && Date.parse(bannedUntil) > Date.now()) {
      res.status(403).json({ error: 'account_blocked' })
      return
    }
    const validLocales = ['pt', 'en', 'fr']
    const headerLocale = req.headers['x-locale'] as string | undefined
    const meta = user.user_metadata as Record<string, string> | undefined
    const locale = validLocales.includes(headerLocale ?? '')
      ? headerLocale!
      : validLocales.includes(meta?.preferred_locale ?? '')
      ? meta!.preferred_locale
      : 'pt'
    ;(req as AuthRequest).userId     = user.id
    ;(req as AuthRequest).jwt        = token
    ;(req as AuthRequest).userLocale = locale
    next()
  } catch (err) {
    console.error('[requireAuth] Supabase error:', err)
    res.status(503).json({ error: 'Serviço de autenticação indisponível' })
  }
}
