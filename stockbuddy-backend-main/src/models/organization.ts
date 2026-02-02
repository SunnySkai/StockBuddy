export interface Organization {
  id: string
  name: string
  owner_user_id: string
  created_at: string
  updated_at: string
}

export enum OrganizationMemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member'
}

export interface OrganizationMember {
  org_id: string
  user_id: string
  role: OrganizationMemberRole
  invited_by_user_id: string | null
  created_at: string
  joined_at: string
}
