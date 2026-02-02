import { User } from '../models/user'

export type PublicUser = Omit<User, 'password_hash'>

export const toPublicUser = (user: User): PublicUser => {
  const { password_hash: _passwordHash, ...publicUser } = user
  return publicUser
}

export const toPublicUserOrNull = (user: User | null | undefined): PublicUser | null => {
  return user ? toPublicUser(user) : null
}
