import express, { NextFunction, Response } from 'express'
import cors from 'cors'
import { Request } from './models/request'
import authRoute from './routes/auth'
import userRoute from './routes/users'
import s3Route from './routes/s3'
import organizationRoute from './routes/organizations'
import footballRoute from './routes/football'
import eventsRoute from './routes/events'
import personalEventsRoute from './routes/personal_events'
import inventoryRecordsRoute from './routes/inventory_records'
import vendorsRoute from './routes/vendors'
import membersRoute from './routes/members'
import banksRoute from './routes/banks'
import transactionsRoute from './routes/transactions'
import directoryRoute from './routes/directory'
import docsRoute from './routes/docs'

const app = express()
const DEFAULT_TENANT = 'STOCKBUDDY'
const BASE_PATH = '/api'

// ---- Essential Middlewares ----
app.use(cors())
const shouldBypassBodyParsing = (req: Request): boolean => {
  const contentType = req.headers['content-type']
  return Boolean(contentType && contentType.includes('multipart/form-data'))
}

const jsonParser = express.json({ limit: '10mb', type: '*/*' })
const urlencodedParser = express.urlencoded({ extended: true })

app.use((req, res, next) => {
  if (shouldBypassBodyParsing(req)) {
    return next()
  }
  return jsonParser(req, res, next)
})

app.use((req, res, next) => {
  if (shouldBypassBodyParsing(req)) {
    return next()
  }
  return urlencodedParser(req, res, next)
})

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now()
  const startString = new Date().toISOString()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(
      `[${startString}] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`
    )
  })
  return next()
})

// Tenant extraction BEFORE routes
app.use((req: Request, _: Response, next: NextFunction): void => {
  // Extract subdomain
  const host = req.hostname
  const subdomain = host.split('.')[0]

  // Set tenant based on subdomain
  if (subdomain && Object.values(['TIXWORLD']).includes(subdomain)) {
    req.tenant = subdomain
  } else {
    req.tenant = DEFAULT_TENANT
  }

  next()
})

// ---- Routes ----

app.get('/', async (req: Request, res: Response): Promise<void> => {
  res.send('<h1>Hello World!</h1><p><a href="/api/docs">View API Documentation</a></p>')
})

// Mount all routes under /api prefix
app.use('/api/docs', docsRoute)
app.use('/api/auth', authRoute)
app.use('/api/users', userRoute)
app.use('/api/s3', s3Route)
app.use('/api/organizations', organizationRoute)
app.use('/api/football', footballRoute)
app.use('/api/events', eventsRoute)
app.use('/api/personal-events', personalEventsRoute)
app.use('/api/inventory-records', inventoryRecordsRoute)
app.use('/api/vendors', vendorsRoute)
app.use('/api/banks', banksRoute)
app.use('/api/members', membersRoute)
app.use('/api/transactions', transactionsRoute)
app.use('/api/directory', directoryRoute)

// ---- Error handler ----
app.use((err: Error, _: Request, res: Response, next: NextFunction): void => {
  console.error(err);
  res.status(500).json({ message: 'Internal Server Error.' });
})

// ---- Local mode only ----
if (process.env.LOCAL === 'true') {
  const port = parseInt(process.env.LOCAL_API_PORT || '3000', 10)
  const hostname = process.env.LOCAL_API_HOSTNAME || '0.0.0.0'
  app.listen(port, hostname, () =>
    console.log(`Local API running at http://${hostname}:${port}`)
  )
}

export default app
