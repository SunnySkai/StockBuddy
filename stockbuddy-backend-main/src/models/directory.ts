export interface DirectoryCustomer {
  id: string
  organization_id: string
  display_id: string
  name: string
  number: string
  email: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DirectoryCounterparty {
  id: string
  organization_id: string
  display_id: string
  name: string
  phone: string
  role: string | null
  email: string | null
  context: string | null
  vendor_id: string | null
  vendor_name: string | null
  created_at: string
  updated_at: string
}

export type DirectoryCustomerCreateInput = {
  name: string
  number: string
  email?: string | null
  notes?: string | null
}

export type DirectoryCustomerUpdateInput = Partial<DirectoryCustomerCreateInput>

export type DirectoryCounterpartyCreateInput = {
  name: string
  phone: string
  role?: string | null
  email?: string | null
  context?: string | null
  vendor_id?: string | null
  vendor_name?: string | null
}

export type DirectoryCounterpartyUpdateInput = Partial<DirectoryCounterpartyCreateInput>
