import express from 'express'
import cors from 'cors'

import fxRouter          from './_routes/fx'
import pricesRouter      from './_routes/prices'
import portfolioRouter   from './_routes/portfolio'
import performanceRouter from './_routes/performance'
import assetsRouter      from './_routes/assets'
import contributionsRouter  from './_routes/contributions'
import institutionsRouter  from './_routes/institutions'
import profileRouter       from './_routes/profile'

const app = express()

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5174' }))
app.use(express.json())

app.use('/api/fx',          fxRouter)
app.use('/api/prices',      pricesRouter)
app.use('/api/portfolio',   portfolioRouter)
app.use('/api/performance', performanceRouter)
app.use('/api/assets',        assetsRouter)
app.use('/api/contributions', contributionsRouter)
app.use('/api/institutions',  institutionsRouter)
app.use('/api/profile',       profileRouter)

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

export default app
