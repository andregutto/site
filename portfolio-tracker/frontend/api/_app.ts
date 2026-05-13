import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'

import fxRouter          from './_routes/fx.js'
import pricesRouter      from './_routes/prices.js'
import portfolioRouter   from './_routes/portfolio.js'
import performanceRouter from './_routes/performance.js'
import assetsRouter      from './_routes/assets.js'
import contributionsRouter  from './_routes/contributions.js'
import institutionsRouter  from './_routes/institutions.js'
import profileRouter       from './_routes/profile.js'
import reportsRouter       from './_routes/reports.js'
import newsletterRouter    from './_routes/newsletter.js'

const app = express()

// CORS: allow env-configured origins + localhost for dev
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)
if (!allowedOrigins.length) allowedOrigins.push('http://localhost:5174')

app.use(cors({ origin: allowedOrigins }))
app.use(express.json())

app.use('/api/fx',            fxRouter)
app.use('/api/prices',        pricesRouter)
app.use('/api/portfolio',     portfolioRouter)
app.use('/api/performance',   performanceRouter)
app.use('/api/assets',        assetsRouter)
app.use('/api/contributions', contributionsRouter)
app.use('/api/institutions',  institutionsRouter)
app.use('/api/profile',       profileRouter)
app.use('/api/reports',       reportsRouter)
app.use('/api/newsletter',    newsletterRouter)

// Health — acessível em /api/health via Vercel routing
app.get(['/health', '/api/health'], (_req, res) => {
  res.json({
    status: 'ok',
    ts: new Date().toISOString(),
    env: {
      supabase_url:  !!process.env.SUPABASE_URL || !!process.env.VITE_SUPABASE_URL,
      service_key:   !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      anon_key:      !!process.env.SUPABASE_ANON_KEY || !!process.env.VITE_SUPABASE_ANON_KEY,
    },
  })
})

// Global error handler — converte erros em JSON em vez de stack trace HTML
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api error]', err.message, err.stack)
  res.status(500).json({ error: err.message ?? 'Internal server error' })
})

export default app
