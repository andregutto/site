import { Router, Request, Response } from 'express'

const router = Router()

router.post('/subscribe', async (req: Request, res: Response) => {
  const { email, first_name, last_name, country } = req.body as {
    email?: string
    first_name?: string
    last_name?: string
    country?: string
  }

  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Email inválido' }); return
  }

  const apiKey = process.env.KIT_API_KEY
  if (!apiKey) {
    res.json({ ok: true, skipped: true }); return
  }

  try {
    const body: Record<string, unknown> = { email_address: email }
    if (first_name) body.first_name = first_name
    if (last_name || country) {
      body.custom_fields = {
        ...(last_name ? { last_name } : {}),
        ...(country   ? { country }   : {}),
      }
    }

    const response = await fetch('https://api.kit.com/v4/subscribers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      console.warn('[newsletter] Kit API error:', response.status, text)
    }
  } catch (err) {
    console.warn('[newsletter] Kit API call failed:', err)
  }

  res.json({ ok: true })
})

export default router
