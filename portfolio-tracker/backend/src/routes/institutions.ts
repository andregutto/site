// Lista de instituições financeiras: bancos BR (BrasilAPI) + internacionais + custom
import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { cache } from '../lib/cache.js'

const router = Router()

const INTERNATIONAL: string[] = [
  'Interactive Brokers', 'Avenue', 'Revolut', 'Wise',
  'Binance', 'Coinbase', 'Exodus', 'Kraken',
  'Natixis', 'Trade Republic', '212', 'Degiro',
  'Saxo Bank', 'Swissquote', 'eToro', 'Lightyear',
  'Scalable Capital', 'Fidelity', 'Charles Schwab',
  'TD Ameritrade', 'XP Investments',
]

const BRASIL_API_URL = 'https://brasilapi.com.br/api/banks/v1'
const TTL_24H = 24 * 60 * 60 * 1000

interface BrasilAPIBank {
  ispb:     string
  name:     string | null
  code:     number | null
  fullName: string | null
}

async function fetchBRBanks(): Promise<string[]> {
  try {
    const banks = await cache.getOrFetch<BrasilAPIBank[]>(BRASIL_API_URL, TTL_24H, async () => {
      const res = await fetch(BRASIL_API_URL)
      if (!res.ok) throw new Error(`BrasilAPI ${res.status}`)
      return res.json() as Promise<BrasilAPIBank[]>
    })
    return banks
      .filter(b => b.code != null && b.name)
      .map(b => b.name!)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  } catch {
    return []
  }
}

// GET /api/institutions — lista unificada para autocomplete
router.get('/', requireAuth, async (_req, res: Response) => {
  const [brBanks, customRaw] = await Promise.all([
    fetchBRBanks(),
    supabaseAdmin
      .from('assets')
      .select('exchange')
      .not('exchange', 'is', null),
  ])

  // Custom: valores de exchange no banco que não estão nas listas padrão
  const defaultNames = new Set([
    ...brBanks.map(n => n.toLowerCase()),
    ...INTERNATIONAL.map(n => n.toLowerCase()),
  ])
  const custom = [...new Set(
    (customRaw.data ?? [])
      .map(r => r.exchange as string)
      .filter(Boolean)
      .filter(n => !defaultNames.has(n.toLowerCase()))
  )].sort()

  res.json({
    br:            brBanks,
    international: INTERNATIONAL,
    custom,
  })
})

export default router
