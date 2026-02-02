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

export type InventoryTransactionAction =
  | 'create_purchase'
  | 'create_order'
  | 'assign'
  | 'unassign'
  | 'complete_sale'
  | 'close_inventory'
  | 'delete_record'
  | 'update_record'
  | 'create_manual'
  | 'manual_status_change'

export interface InventoryRecord {
  id: string
  organization_id: string
  tenant: string
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

export type PurchaseCreateInput = {
  quantity: number
  area: string
  cost: number
  bought_from: string
  bought_from_vendor_id: string
  block?: string | null
  row?: string | null
  seats?: string | null
  seat_assignments?: SeatAssignment[]
  age_group?: string | null
  member_id?: string | null
  game_id: string
  notes?: string | null
}

export type OrderCreateInput = {
  quantity: number
  area: string
  sold_to: string
  selling: number
  sold_to_vendor_id: string
  block?: string | null
  row?: string | null
  seats?: string | null
  age_group?: string | null
  order_number?: string | null
  game_id: string
  notes?: string | null
}

export type InventoryRecordUpdateInput = Partial<{
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

export type InventorySplitPartInput = {
  quantity: number
  seats?: string | null
  seat_assignments?: SeatAssignment[]
  member_id?: string | null
}
