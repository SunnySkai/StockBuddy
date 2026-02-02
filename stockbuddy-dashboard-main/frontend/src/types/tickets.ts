export type TicketStatus = 'unfulfilled' | 'available' | 'reserved' | 'completed' | 'cancelled'

export type Ticket = {
  id: string
  organization_id: string
  game_id: string
  quantity: number
  member_id: string | null
  bought_from_vendor_id: string | null
  sold_to_vendor_id: string | null
  general_block: string | null
  block: string | null
  row: string | null
  seats: string | null
  age_group: string | null
  bought_from: string | null
  order_number: string | null
  sold_to: string | null
  cost: number | null
  selling: number | null
  profit: number | null
  status: TicketStatus
  created_at: string
  updated_at: string
}

export type TicketCreatePayload = {
  game_id: string
  quantity: number
  member_id?: string | null
  bought_from_vendor_id?: string | null
  sold_to_vendor_id?: string | null
  general_block?: string | null
  block?: string | null
  row?: string | null
  seats?: string | null
  age_group?: string | null
  bought_from?: string | null
  order_number?: string | null
  sold_to?: string | null
  cost?: number | null
  selling?: number | null
  status?: TicketStatus
}

export type TicketUpdatePayload = Partial<Omit<TicketCreatePayload, 'game_id'>>

export type TicketListResponse = {
  success: boolean
  data: Ticket[]
}

export type TicketMutationResponse = {
  success: boolean
  data: Ticket
}

export type CreateTicketsResponse = {
  success: boolean
  data: Ticket[]
}

export type SimpleSuccessResponse = {
  success: boolean
}
