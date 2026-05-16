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
import indicesRouter       from './routes/indices.js'

const app  = express()
const PORT = process.env.PORT || 3001

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
app.use('/api/newsletter',    newsletterRouter)
app.use('/api/indices',       indicesRouter)

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

app.listen(PORT, () => console.log(`Backend em http://localhost:${PORT}`))
