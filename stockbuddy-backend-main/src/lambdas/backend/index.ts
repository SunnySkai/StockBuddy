import type { Request as ExpressRequest } from 'express'
import serverless from 'serverless-http'
import app from '../../index'

type LambdaEvent = Record<string, unknown> & { body?: string | Buffer | null }

export const handler = serverless(app, {
  request: (req: ExpressRequest, event: LambdaEvent) => {
    // Case 1: Body is a JSON string
    if (typeof event.body === 'string') {
      try {
        req.body = JSON.parse(event.body)
      } catch {
        req.body = event.body // fallback
      }
    }

    // Case 2: Body is a Buffer
    if (Buffer.isBuffer(event.body)) {
      const str = event.body.toString('utf8')
      try {
        req.body = JSON.parse(str)
      } catch {
        req.body = str // fallback
      }
    }
  }
})
