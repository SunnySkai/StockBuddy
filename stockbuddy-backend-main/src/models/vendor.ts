export interface Vendor {
  id: string
  organization_id: string
  display_id: number | null
  name: string
  balance: number
  created_at: string
  updated_at: string
}

export type VendorCreateInput = {
  name: string
  balance?: number | null
}

export type VendorUpdateInput = Partial<VendorCreateInput>
