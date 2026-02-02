import { validate } from 'email-validator'

export function validateAndNormalizeEmail(email: string) {
  if (!email || typeof email !== 'string') {
    throw new Error('Email is not valid')
  }
  email = email.trim()
  if (!validate(email)) {
    throw new Error('Email is not valid')
  }
  return email.toLowerCase()
}
