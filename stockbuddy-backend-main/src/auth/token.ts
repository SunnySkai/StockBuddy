import jwt from 'jsonwebtoken'
import { Request } from 'express'
import { getSecretValue } from '../aws_integration/secrets_manager/get'

interface Payload {
  exp: number
  iat: number
  sub: string
}

const _getSecret = async (): Promise<string> => {
  if (!process.env.APP_SECRET_NAME) {
    throw new Error('Missing env variable: APP_SECRET_NAME')
  }
  const appSecretName = await getSecretValue(process.env.APP_SECRET_NAME)
  return appSecretName.value
}

const encodeAuthToken = async (userId: string): Promise<string> => {
  const currentTime = new Date()
  const payload: Payload = {
    exp: currentTime.getTime() + 365 * 24 * 60 * 60 * 1000,
    iat: currentTime.getTime(),
    sub: userId
  }
  const secret = await _getSecret()
  return jwt.sign(payload, secret, { algorithm: 'HS256' })
}

const decodeAuthToken = async (authToken: string): Promise<string> => {
  const secret = await _getSecret()
  try {
    const payload = jwt.verify(authToken, secret, { algorithms: ['HS256']})
    if (typeof payload === 'object' && 'sub' in payload) {
      return payload.sub as string
    }
    throw new jwt.JsonWebTokenError('Invalid token.')
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired.')
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token.')
    }
    throw new Error('Access denied.')
  }
}

const tryGetUserIdFromAuthToken = async (request: Request): Promise<string | null> => {
  const secret = await _getSecret()
  const authHeader = request.header('authorization')
  if (!authHeader) return null
  const token = authHeader.split(' ')[1]
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256']})
    if (typeof payload === 'object' && 'sub' in payload) {
      return payload.sub as string
    }
    throw new jwt.JsonWebTokenError('Invalid token.')
  } catch (error) {
    return null
  }
}

export { encodeAuthToken, decodeAuthToken, tryGetUserIdFromAuthToken }
