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
    first_name:           meta.first_name           ?? '',
    last_name:            meta.last_name             ?? '',
    country:              meta.country               ?? '',
    tax_country:          meta.tax_country           ?? '',
    birthdate:            meta.birthdate             ?? '',
    default_currency:     meta.default_currency      ?? '',
    portfolio_start_date: meta.portfolio_start_date  ?? '',
    allocation_targets:   meta.allocation_targets    ?? {},
    institution_data:     meta.institution_data      ?? {},
    avatar_url:           meta.avatar_url            ?? '',
  })
})

router.patch('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const {
    first_name, last_name, country, tax_country, birthdate, default_currency,
    portfolio_start_date, allocation_targets, institution_data, avatar_url,
  } = req.body as {
    first_name?: string; last_name?: string; country?: string
    tax_country?: string; birthdate?: string; default_currency?: string
    portfolio_start_date?: string; allocation_targets?: Record<string, number>
    institution_data?: Record<string, Record<string, string>>
    avatar_url?: string
  }
  const { data: { user: current } } = await supabaseAdmin.auth.admin.getUserById(userId)
  const meta = {
    ...(current?.user_metadata ?? {}),
    ...Object.fromEntries(
      Object.entries({
        first_name, last_name, country, tax_country, birthdate, default_currency,
        portfolio_start_date, allocation_targets, institution_data, avatar_url,
      }).filter(([, v]) => v !== undefined)
    ),
  }
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
