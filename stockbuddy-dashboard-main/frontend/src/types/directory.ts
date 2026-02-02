export type DirectoryCustomerRecord = {
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

export type DirectoryCounterpartyRecord = {
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

export type DirectoryListResponse = {
  success: boolean
  data: {
    customers: DirectoryCustomerRecord[]
    counterparties: DirectoryCounterpartyRecord[]
  }
}

export type DirectoryCustomerResponse = {
  success: boolean
  data: DirectoryCustomerRecord
}

export type DirectoryCounterpartyResponse = {
  success: boolean
  data: DirectoryCounterpartyRecord
}

export type DirectoryCustomerPayload = {
  name: string
  number: string
  email?: string | null
  notes?: string | null
}

export type DirectoryCounterpartyPayload = {
  name: string
  phone: string
  role?: string | null
  email?: string | null
  context?: string | null
  vendor_id?: string | null
  vendor_name?: string | null
}
