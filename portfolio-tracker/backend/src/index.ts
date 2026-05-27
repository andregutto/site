import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import fxRouter          from './routes/fx.js'
import pricesRouter      from './routes/prices.js'
import portfolioRouter   from './routes/portfolio.js'
import performanceRouter from './routes/performance.js'
import assetsRouter       from './routes/assets.js'
import contributionsRouter  from './routes/contributions.js'
import institutionsRouter  from './routes/institutions.js'
import profileRouter       from './routes/profile.js'
import newsletterRouter    from './routes/newsletter.js'
import indicesRouter        from './routes/indices.js'
import achievementsRouter   from './routes/achievements.js'
import financesRouter       from './routes/finances.js'
import banksRouter          from './routes/banks.js'
import publicRouter         from './routes/public.js'
import chatRouter           from './routes/chat.js'
import reportsRouter        from './routes/reports.js'
import dividendsRouter      from './routes/dividends.js'
import sharedRouter         from './routes/shared.js'

const app  = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5174' }))
app.use(express.json({ limit: '2mb' }))

app.use('/api/fx',          fxRouter)
app.use('/api/prices',      pricesRouter)
app.use('/api/portfolio',   portfolioRouter)
app.use('/api/performance', performanceRouter)
app.use('/api/assets',        assetsRouter)
app.use('/api/contributions', contributionsRouter)
app.use('/api/institutions',  institutionsRouter)
app.use('/api/profile',       profileRouter)
app.use('/api/newsletter',    newsletterRouter)
app.use('/api/indices',        indicesRouter)
app.use('/api/achievements',  achievementsRouter)
app.use('/api/finances',      financesRouter)
app.use('/api/banks',         banksRouter)
app.use('/api/public',        publicRouter)
app.use('/api/chat',         chatRouter)
app.use('/api/reports',     reportsRouter)
app.use('/api/dividends',   dividendsRouter)
app.use('/api/shared',      sharedRouter)

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

app.use((err: Error, _req: import('express').Request, res: import('express').Response, _next: import('express').NextFunction) => {
  console.error('[api error]', err.message, err.stack)
  res.status(500).json({ error: err.message ?? 'Internal server error' })
})

app.listen(PORT, () => console.log(`Backend em http://localhost:${PORT}`))
