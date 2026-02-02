export interface User {
  id: string
  email: string
  username: string | null
  password_hash: string
  full_name: string
  created_at: string
  profile_pic_url: string
  is_admin: boolean
  is_seller: boolean
  organization_id: string | null
  org_joined_at: string | null
}
