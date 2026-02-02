import { Response, NextFunction } from 'express'
import { decodeAuthToken } from '../auth/token'
import { getUserById, isTokenBlacklisted } from '../daos/user'
import { User } from '../models/user'
import { AuthenticatedRequest, Request } from '../models/request'

const requireStringParam = (paramName: string, validator: Function | null = null) => {
  return (request: Request, response: Response, next: NextFunction) => {
    console.log("BODY:", request.body, typeof request.body)
    const value = request.body ? request.body[paramName] : undefined
    if (value) {
      if (typeof value !== 'string') {
        response
          .status(400)
          .json({ message: `Parameter ${paramName} must be string` })
        return
      }
      if (validator && !validator(value)) {
        response.status(400).json({
          message: `Validator failed for string parameter ${paramName}`,
        })
        return
      }
      next()
      return
    }
    response
      .status(400)
      .json({ message: `Required string parameter ${paramName}` })
    return
  }
}

const requireStringListParam = (paramName: string, validator: Function | null = null) => {
  return (request: Request, response: Response, next: NextFunction) => {
    const value = request.body ? JSON.parse(request.body[paramName]) : undefined
    if (value) {
      if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        response
          .status(400)
          .json({ message: `Parameter ${paramName} must be an array of strings` })
        return
      }
      if (validator && !validator(value)) {
        response.status(400).json({
          message: `Validator failed for string list parameter ${paramName}`,
        })
        return
      }
      next()
      return
    }
    response
      .status(400)
      .json({ message: `Required string list parameter ${paramName}` })
    return
  }
}

const optionalStringParam = (paramName: string, validator: Function | null = null) => {
  return (request: Request, response: Response, next: NextFunction) => {
    const value = request.body ? request.body[paramName] : undefined
    if (value) {
      if (typeof value !== 'string') {
        response
          .status(400)
          .json({ message: `Parameter ${paramName} must be string` })
        return
      }
      if (validator && !validator(value)) {
        response.status(400).json({
          message: `Validator failed for string parameter ${paramName}`,
        })
        return
      }
    }
    next()
    return
  }
}

const _isIntString = (possibleIntString: string) => {
  try {
    parseInt(possibleIntString)
    return true
  } catch (error) {
    return false
  }
}

const requireIntParam = (paramName: string, validator: Function | null = null) => {
  return (request: Request, response: Response, next: NextFunction): void => {
    const value = request.body ? request.body[paramName] : undefined

    if (value) {
      if (!_isIntString(value)) {
        response.status(400).json({ message: `Parameter ${paramName} must be integer` })
        return
      }

      if (validator && !validator(parseInt(value))) {
        response.status(400).json({
          message: `Validator failed for string parameter ${paramName}`,
        })
        return
      }

      next()
      return
    }

    response.status(400).json({ message: `Required int parameter ${paramName}` })
  }
}

const optionalIntParam = (paramName: string, validator: Function | null = null) => {
  return (request: Request, response: Response, next: NextFunction): void => {
    const value = request.body ? request.body[paramName] : undefined

    if (value) {
      if (!_isIntString(value)) {
        response.status(400).json({ message: `Parameter ${paramName} must be integer` })
        return
      }

      if (validator && !validator(parseInt(value))) {
        response.status(400).json({
          message: `Validator failed for string parameter ${paramName}`,
        })
        return
      }  
    }
    next()
    return
  }
}

const requireFileParam = (paramName: string, validator: Function | null = null) => {
  return (request: Request, response: Response, next: NextFunction) => {
    const value = request.files
    if (value && Array.isArray(value) && value.length && value[0]) {
      if (typeof value[0] !== 'object') {
        response
          .status(400)
          .json({ message: `Parameter ${paramName} must be file` })
        return
      }
      if (validator && !validator(value)) {
        response.status(400).json({
          message: `Validator failed for file parameter ${paramName}`,
        })
        return
      }
      next()
      return
    } else {
      response
        .status(400)
        .json({ message: `Required file parameter ${paramName}` })
      return
    }
  }
}

const optionalFileParam = (paramName: string, validator: Function | null = null) => {
  return (request: Request, response: Response, next: NextFunction) => {
    const value = request.files
    if (value && Array.isArray(value) && value.length && value[0]) {
      if (typeof value[0] !== 'object') {
        response
          .status(400)
          .json({ message: `Parameter ${paramName} must be file` })
        return
      }
      if (validator && !validator(value)) {
        response.status(400).json({
          message: `Validator failed for file parameter ${paramName}`,
        })
        return
      }
    }
    next()
    return
  }
}

const requireJsonParam = (paramName: string, validator: Function | null = null) => {
  return (request: Request, response: Response, next: NextFunction) => {
    const value = request.body ? request.body[paramName] : undefined
    if (value) {
      try {
        const parsedValue = JSON.parse(value)
        if (validator && !validator(parsedValue)) {
          response.status(400).json({
            message: `Validator failed for JSON parameter ${paramName}`,
          })
          return
        }
        next()
        return
      } catch (error) {
        response
          .status(400)
          .json({ message: `Parameter ${paramName} must be valid JSON` })
        return
      }
    }
    response
      .status(400)
      .json({ message: `Required JSON parameter ${paramName}` })
    return
  }
}

const optionalJsonParam = (paramName: string, validator: Function | null = null) => {
  return (request: Request, response: Response, next: NextFunction) => {
    const value = request.body ? request.body[paramName] : undefined
    if (value) {
      try {
        const parsedValue = JSON.parse(value)
        if (validator && !validator(parsedValue)) {
          response.status(400).json({
            message: `Validator failed for JSON parameter ${paramName}`,
          })
          return
        }
      } catch (error) {
        response
          .status(400)
          .json({ message: `Parameter ${paramName} must be valid JSON` })
        return
      }
    }
    next()
    return
  }
}

const requireLoggedInUser = () => {
  return (request: Request, response: Response, next: NextFunction): void => {
    const authRequest = (request as AuthenticatedRequest)
    const authHeader = request.header('authorization')
    if (!authHeader) {
      response.status(401).json({ message: 'Access denied.' })
      return
    }

    const tenant = authRequest.tenant ?? ''
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(authHeader.indexOf(' ') + 1).trim()
      : authHeader.trim()

    if (!token) {
      response.status(401).json({ message: 'Access denied.' })
      return
    }

    isTokenBlacklisted(tenant, token)
      .then((isBlacklisted) => {
        if (isBlacklisted) throw new Error('Access denied.')
        return decodeAuthToken(token)
      })
      .then((userId) => {
        if (!userId) throw new Error('Access denied.')
        authRequest.userId = userId
        return getUserById(tenant, authRequest.userId)
      })
      .then((user: User | null) => {
        if (!user) throw new Error('Access denied.')
        authRequest.user = user
        return next()
      })
      .catch((error) => {
        response.status(401).json({ message: error.message })
      })
  }
}

export {
  requireStringParam,
  optionalStringParam,
  requireIntParam,
  optionalIntParam,
  requireFileParam,
  optionalFileParam,
  requireLoggedInUser,
  requireStringListParam,
  requireJsonParam,
  optionalJsonParam
}
