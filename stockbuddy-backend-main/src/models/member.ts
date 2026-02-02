export interface Member {
  id: string
  organization_id: string
  name: string
  email: string
  status: MemberStatus
  group_label: string | null
  team_id: string | null
  team_name: string | null
  team_logo: string | null
  account_password: string | null
  account_number: string | null
  phone_number: string | null
  date_of_birth: string | null
  membership_type: string | null
  member_age_type: string | null
  address: string | null
  post_code: string | null
  account_age: string | null
  membership_price: string | null
  vendor_id: string | null
  vendor_name: string | null
  bank: string | null
  created_at: string
  updated_at: string
}

export type MemberStatus = 'ACTIVE' | 'BANNED'

export type MemberCreateInput = {
  name: string
  email: string
  status?: MemberStatus
  group_label?: string | null
  team_id?: string | null
  team_name?: string | null
  team_logo?: string | null
  account_password?: string | null
  account_number?: string | null
  phone_number?: string | null
  date_of_birth?: string | null
  membership_type?: string | null
  member_age_type?: string | null
  address?: string | null
  post_code?: string | null
  account_age?: string | null
  membership_price?: string | null
  vendor_id?: string | null
  vendor_name?: string | null
  bank?: string | null
}

export type MemberUpdateInput = Partial<MemberCreateInput>
