import type { InventoryRecord } from './inventory'
import type { MemberStatus } from './members'
import type { Transaction, TransactionSummary } from './transactions'

export type VendorRecord = {
  id: string
  organization_id: string
  display_id?: number | null
  name: string
  balance: number
  created_at: string
  updated_at: string
}

export type VendorListSummary = {
  count: number
  total_balance: number
}

export type VendorListPayload = {
  vendors: VendorRecord[]
  summary: VendorListSummary
}

export type VendorListResponse = {
  success: boolean
  data: VendorListPayload
}

export type VendorDetailResponse = {
  success: boolean
  data: VendorRecord
}

export type VendorCreatePayload = {
  name: string
  balance?: number | null
}

export type VendorUpdatePayload = Partial<VendorCreatePayload>

export type VendorMembershipTransaction = {
  id: string
  name: string
  email: string
  membership_type: string | null
  membership_price: string | null
  status: MemberStatus
  created_at: string
  updated_at: string
}

export type VendorTransactionsBundle = {
  vendor: VendorRecord
  records: InventoryRecord[]
  memberships: VendorMembershipTransaction[]
  transactions: Transaction[]
  totals: TransactionSummary
}
