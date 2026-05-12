import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth'
import { supabaseAdmin } from '../_lib/supabase'

const router = Router()

router.get('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !user) { res.status(404).json({ error: 'Usuário não encontrado' }); return }
  const meta = user.user_metadata ?? {}
  res.json({
    email:                user.email ?? '',
    first_name:           meta.first_name ?? '',
    last_name:            meta.last_name  ?? '',
    country:              meta.country    ?? '',
    portfolio_start_date: meta.portfolio_start_date ?? '',
    allocation_targets:   meta.allocation_targets   ?? {},
  })
})

router.patch('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { first_name, last_name, country, portfolio_start_date, allocation_targets } = req.body as {
    first_name?: string; last_name?: string; country?: string
    portfolio_start_date?: string; allocation_targets?: Record<string, number>
  }
  const { data: { user: current } } = await supabaseAdmin.auth.admin.getUserById(userId)
  const meta = { ...(current?.user_metadata ?? {}), ...Object.fromEntries(
    Object.entries({ first_name, last_name, country, portfolio_start_date, allocation_targets })
      .filter(([, v]) => v !== undefined)
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
