import express, { Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import swaggerDocument from '../swagger/swagger.json'
import path from 'path'

const route = express.Router()

// Swagger UI setup
const swaggerOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #3b82f6; }
    .swagger-ui .scheme-container { background: #f8fafc; padding: 10px; border-radius: 4px; }
  `,
  customSiteTitle: "StockBuddy API Documentation",
  customfavIcon: "/favicon.ico"
}

// Serve static HTML page
route.get('/overview', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../swagger/index.html'))
})

// Serve Swagger UI
route.use('/swagger', swaggerUi.serve)
route.get('/swagger', swaggerUi.setup(swaggerDocument, swaggerOptions))

// API docs JSON endpoint
route.get('/swagger.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json')
  res.send(swaggerDocument)
})

// Redirect root docs to overview page
route.get('/', (req: Request, res: Response) => {
  res.redirect('/api/docs/overview')
})

export default route