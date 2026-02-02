import type { AuthenticatedUser, SessionOrganization } from './auth'

export type OrganizationMemberRole = 'owner' | 'admin' | 'member'

export type OrganizationMember = {
  org_id: string
  user_id: string
  role: OrganizationMemberRole
  invited_by_user_id: string | null
  created_at: string
  joined_at: string
  user?: AuthenticatedUser | null
}

export type OrganizationInvitationStatus = 'pending' | 'accepted' | 'cancelled' | 'expired'

export type OrganizationInvitation = {
  code: string
  org_id: string
  email: string
  invited_by_user_id: string | null
  status: OrganizationInvitationStatus
  created_at: string
  updated_at: string
  expires_at: string | null
  accepted_at: string | null
  accepted_by_user_id: string | null
  cancelled_at: string | null
  cancelled_by_user_id: string | null
}

export type OrganizationProfile = SessionOrganization

export type InvitationWithOrganization = {
  success: true
  invitation: {
    code: string
    status: OrganizationInvitationStatus
    email: string
    expires_at: string | null
    invited_by_user_id: string | null
    organization: { id: string; name: string } | null
  }
}
