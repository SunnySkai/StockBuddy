export type InventoryRecordType = 'inventory' | 'order' | 'sale'

export type InventoryRecordStatus =
  | 'Available'
  | 'Closed'
  | 'Unfulfilled'
  | 'Reserved'
  | 'Completed'
  | 'Cancelled'

export type SeatAssignment = {
  seat_label: string | null
  member_id: string | null
}

export type InventoryRecord = {
  id: string
  organization_id: string
  tenant?: string
  game_id: string | null
  record_type: InventoryRecordType
  status: InventoryRecordStatus
  quantity: number
  area: string | null
  block: string | null
  row: string | null
  seats: string | null
  seat_assignments: SeatAssignment[]
  age_group: string | null
  member_id: string | null
  bought_from: string | null
  cost: number | null
  order_number: string | null
  sold_to: string | null
  selling: number | null
  bought_from_vendor_id: string | null
  sold_to_vendor_id: string | null
  transaction_id: string
  sale_id: string | null
  source_inventory_id: string | null
  source_order_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type PurchasePayload = {
  game_id: string
  quantity: number
  area: string
  bought_from: string
  bought_from_vendor_id: string
  cost: number
  member_id?: string | null
  block?: string | null
  row?: string | null
  seats?: string | null
  seat_assignments?: SeatAssignment[]
  age_group?: string | null
  notes?: string | null
}

export type OrderPayload = {
  game_id: string
  quantity: number
  area: string
  order_number?: string | null
  sold_to: string
  sold_to_vendor_id: string
  selling: number
  block?: string | null
  row?: string | null
  seats?: string | null
  age_group?: string | null
  notes?: string | null
}

export type InventorySplitPartPayload = {
  quantity: number
  seats?: string | null
  seat_assignments?: SeatAssignment[]
  member_id?: string | null
}

export type InventoryRecordUpdatePayload = Partial<{
  quantity: number
  area: string
  block: string | null
  row: string | null
  seats: string | null
  seat_assignments: SeatAssignment[]
  age_group: string | null
  member_id: string | null
  bought_from: string | null
  bought_from_vendor_id: string | null
  cost: number | null
  order_number: string | null
  sold_to: string | null
  sold_to_vendor_id: string | null
  selling: number | null
  status: InventoryRecordStatus
  notes: string | null
}>

export type InventoryRecordsResponse = {
  success: boolean
  data: InventoryRecord[]
}

export type InventoryRecordResponse = {
  success: boolean
  data: InventoryRecord
}

export type SimpleSuccessResponse = { success: boolean }
