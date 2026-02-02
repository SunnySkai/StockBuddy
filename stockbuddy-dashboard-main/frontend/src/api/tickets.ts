import { apiDelete, apiGet, apiPost, apiRequest, type ApiResult } from './client'
import type {
  CreateTicketsResponse,
  Ticket,
  TicketCreatePayload,
  TicketListResponse,
  TicketMutationResponse,
  TicketUpdatePayload
} from '../types/tickets'
export const fetchTickets = (token: string, gameId: string): Promise<ApiResult<TicketListResponse>> => {
  const query = new URLSearchParams({ game_id: gameId })
  return apiGet<TicketListResponse>(`/tickets?${query.toString()}`, { token })
}
export const createTickets = (
  token: string,
  payloads: TicketCreatePayload[]
): Promise<ApiResult<CreateTicketsResponse>> => {
  return apiPost<CreateTicketsResponse>('/tickets', { tickets: payloads }, { token })
}
export const createTicket = async (
  token: string,
  payload: TicketCreatePayload
): Promise<ApiResult<Ticket>> => {
  const result = await createTickets(token, [payload])
  if (!result.ok) {
    return result
  }
  const created = result.data.data[0]
  return { ok: true, data: created, status: result.status }
}
export const updateTicket = (
  token: string,
  ticketId: string,
  payload: TicketUpdatePayload
): Promise<ApiResult<TicketMutationResponse>> => {
  return apiRequest<TicketMutationResponse>(`/tickets/${ticketId}`, {
    method: 'PUT',
    token,
    body: payload
  })
}
export const deleteTicket = (
  token: string,
  ticketId: string
): Promise<ApiResult<{ success: boolean }>> => {
  return apiDelete<{ success: boolean }>(`/tickets/${ticketId}`, { token })
}