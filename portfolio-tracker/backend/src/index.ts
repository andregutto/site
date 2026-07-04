import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import fxRouter          from '../../shared-api/src/routes/fx.js'
import pricesRouter      from '../../shared-api/src/routes/prices.js'
import portfolioRouter   from '../../shared-api/src/routes/portfolio.js'
import performanceRouter from '../../shared-api/src/routes/performance.js'
import assetsRouter       from '../../shared-api/src/routes/assets.js'
import contributionsRouter  from '../../shared-api/src/routes/contributions.js'
import institutionsRouter  from '../../shared-api/src/routes/institutions.js'
import profileRouter       from '../../shared-api/src/routes/profile.js'
import newsletterRouter    from '../../shared-api/src/routes/newsletter.js'
import indicesRouter        from '../../shared-api/src/routes/indices.js'
import achievementsRouter   from '../../shared-api/src/routes/achievements.js'
import notificationsRouter  from '../../shared-api/src/routes/notifications.js'
import financesRouter       from '../../shared-api/src/routes/finances.js'
import banksRouter          from '../../shared-api/src/routes/banks.js'
import publicRouter         from '../../shared-api/src/routes/public.js'
import chatRouter           from '../../shared-api/src/routes/chat.js'
import reportsRouter        from '../../shared-api/src/routes/reports.js'
import dividendsRouter      from '../../shared-api/src/routes/dividends.js'
import sharedRouter         from '../../shared-api/src/routes/shared.js'
import voyageRouter         from '../../shared-api/src/routes/voyage.js'
import peopleRouter         from '../../shared-api/src/routes/people.js'
import communityRouter      from '../../shared-api/src/routes/community.js'
import messagingRouter      from '../../shared-api/src/routes/messaging.js'
import importRouter         from '../../shared-api/src/routes/import.js'

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
app.use('/api/notifications', notificationsRouter)
app.use('/api/finances',      financesRouter)
app.use('/api/banks',         banksRouter)
app.use('/api/public',        publicRouter)
app.use('/api/chat',         chatRouter)
app.use('/api/reports',     reportsRouter)
app.use('/api/dividends',   dividendsRouter)
app.use('/api/shared',      sharedRouter)
app.use('/api/voyage',      voyageRouter)
app.use('/api/people',     peopleRouter)
app.use('/api/community',  communityRouter)
app.use('/api/messages',   messagingRouter)
app.use('/api/import',      importRouter)

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

app.use((err: Error, _req: import('express').Request, res: import('express').Response, _next: import('express').NextFunction) => {
  console.error('[api error]', err.message, err.stack)
  res.status(500).json({ error: err.message ?? 'Internal server error' })
})

app.listen(PORT, () => console.log(`Backend em http://localhost:${PORT}`))
