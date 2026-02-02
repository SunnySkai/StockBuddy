import { Request as ExpressRequest } from 'express'
import { User } from './user'

export interface Request extends ExpressRequest {
  tenant?: string,
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] }
}

export interface AuthenticatedRequest extends Request {
  userId: string
  headers: {
    authorization: string
  } & ExpressRequest['headers']
  user?: User
}
