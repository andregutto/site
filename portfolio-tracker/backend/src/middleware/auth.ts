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

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) {
    res.status(401).json({ error: 'Token inválido ou expirado' })
    return
  }

  const validLocales = ['pt', 'en', 'fr']
  const meta = user.user_metadata as Record<string, string> | undefined
  const locale = validLocales.includes(meta?.preferred_locale ?? '') ? meta!.preferred_locale : 'pt'
  ;(req as AuthRequest).userId     = user.id
  ;(req as AuthRequest).jwt        = token
  ;(req as AuthRequest).userLocale = locale
  next()
}
