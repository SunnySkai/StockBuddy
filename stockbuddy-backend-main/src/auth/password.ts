import crypto from 'crypto'

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':')
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  return hash === verifyHash
}

function validatePassword(password: string): boolean {
  const hasDigit = /\d/ // Check for at least one digit
  const hasUpper = /[A-Z]/ // Check for at least one uppercase letter
  const hasLower = /[a-z]/ // Check for at least one lowercase letter
  const minLength = 6 // Minimum length

  // Validate password
  if (password.length >= minLength && hasDigit.test(password) && 
    hasUpper.test(password) && hasLower.test(password)) {
    return true // Password is valid
  }
  return false // Password is invalid
}

export {
  hashPassword,
  verifyPassword,
  validatePassword
}
