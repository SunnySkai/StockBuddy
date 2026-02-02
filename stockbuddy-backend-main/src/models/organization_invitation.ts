export enum OrganizationInvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

export interface OrganizationInvitation {
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
