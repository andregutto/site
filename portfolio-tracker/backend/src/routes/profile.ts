import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

router.get('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !user) { res.status(404).json({ error: 'Usuário não encontrado' }); return }
  const meta = user.user_metadata ?? {}
  res.json({
    email:                user.email ?? '',
    name:                 meta.name ?? '',
    country:              meta.country ?? '',
    portfolio_start_date: meta.portfolio_start_date ?? '',
  })
})

router.patch('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { name, country, portfolio_start_date } = req.body as {
    name?: string; country?: string; portfolio_start_date?: string
  }
  const { data: { user: current } } = await supabaseAdmin.auth.admin.getUserById(userId)
  const meta = { ...(current?.user_metadata ?? {}), ...Object.fromEntries(
    Object.entries({ name, country, portfolio_start_date }).filter(([, v]) => v !== undefined)
  )}
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: meta })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

router.patch('/password', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { password } = req.body as { password: string }
  if (!password || password.length < 6) {
    res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' }); return
  }
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

export default router
