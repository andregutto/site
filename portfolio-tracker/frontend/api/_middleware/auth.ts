import { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../_lib/supabase'

export interface AuthRequest extends Request {
  userId: string
  jwt: string
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
    (req as AuthRequest).userId = user.id
    ;(req as AuthRequest).jwt   = token
    next()
  } catch (err) {
    console.error('[requireAuth] Supabase error:', err)
    res.status(503).json({ error: 'Serviço de autenticação indisponível' })
  }
}
