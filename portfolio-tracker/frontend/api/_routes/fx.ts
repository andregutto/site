import { Router, Request, Response } from 'express'
import { cache, TTL } from '../_lib/cache'

const router = Router()
const AWESOME_BASE = 'https://economia.awesomeapi.com.br/json'

async function awesomeFetch<T>(url: string, ttlMs: number): Promise<T> {
  return cache.getOrFetch(url, ttlMs, async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`AwesomeAPI ${res.status}`)
    return res.json() as Promise<T>
  })
}

router.get('/current', async (req: Request, res: Response) => {
  const pairs = (req.query.pairs as string) || 'USD-BRL,EUR-BRL'
  try {
    const data = await awesomeFetch<Record<string, Record<string, string>>>(
      `${AWESOME_BASE}/last/${pairs}`, TTL.FX_CURRENT
    )
    res.json(Object.values(data).map((e) => ({
      from:      e.code,
      to:        e.codein,
      rate:      parseFloat(e.bid),
      timestamp: parseInt(e.timestamp),
      date:      new Date(parseInt(e.timestamp) * 1000).toISOString(),
    })))
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
})

router.get('/historical', async (req: Request, res: Response) => {
  const pair = (req.query.pair as string) || 'USD-BRL'
  const days = parseInt((req.query.days as string) || '30')
  try {
    const data = await awesomeFetch<Array<{ timestamp: string; bid: string }>>(
      `${AWESOME_BASE}/daily/${pair}/${days}`, TTL.FX_HISTORICAL
    )
    res.json(data.map((p) => ({
      date: new Date(parseInt(p.timestamp) * 1000).toISOString().split('T')[0],
      rate: parseFloat(p.bid),
    })).reverse())
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
})

router.get('/range', async (req: Request, res: Response) => {
  const pair  = (req.query.pair  as string) || 'USD-BRL'
  const start = req.query.start as string
  const end   = req.query.end   as string
  if (!start || !end) {
    res.status(400).json({ error: 'start e end obrigatórios (YYYYMMDD)' }); return
  }
  try {
    const data = await awesomeFetch<Array<{ timestamp: string; bid: string }>>(
      `${AWESOME_BASE}/daily/${pair}?start_date=${start}&end_date=${end}`, TTL.FX_HISTORICAL
    )
    res.json(data.map((p) => ({
      date: new Date(parseInt(p.timestamp) * 1000).toISOString().split('T')[0],
      rate: parseFloat(p.bid),
    })).reverse())
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
})

export default router
