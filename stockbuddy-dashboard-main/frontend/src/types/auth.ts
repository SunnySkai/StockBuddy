export type AuthMode = 'login' | 'signup'

export type AuthenticatedUser = {
  id: string
  email: string
  username?: string | null
  full_name?: string | null
  organization_id?: string | null
  org_joined_at?: string | null
  profile_pic_url?: string | null
  is_admin?: boolean
  is_seller?: boolean
  [key: string]: unknown
}

export type AuthSuccessResponse = {
  success: true
  user: AuthenticatedUser
  auth_token: string
}

export type AuthErrorResponse = {
  success?: false
  message?: string
}

export type SessionOrganization = {
  id: string
  name: string
  owner_user_id: string
  created_at: string
  updated_at: string
}

export type MeSuccessResponse = {
  success: true
  user: AuthenticatedUser
  organization: SessionOrganization | null
  has_organization: boolean
}
