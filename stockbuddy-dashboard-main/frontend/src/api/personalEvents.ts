import { apiDelete, apiGet, apiPatch, apiPost, type ApiResult } from './client'
import type { PersonalEvent } from '../types/personalEvents'

export const fetchPersonalEvents = (
  token: string,
  params: { from?: string; to?: string } = {},
  options: { signal?: AbortSignal } = {}
): Promise<ApiResult<{ success: boolean; data: PersonalEvent[] }>> => {
  const qs = new URLSearchParams()
  if (params.from) qs.append('from', params.from)
  if (params.to) qs.append('to', params.to)
  const query = qs.toString()
  return apiGet<{ success: boolean; data: PersonalEvent[] }>(
    `/personal-events${query ? `?${query}` : ''}`,
    { token, signal: options.signal }
  )
}

export const createPersonalEvent = (
  token: string,
  body: {
    title: string
    description?: string
    start_time: string
    end_time?: string
    location?: string
    repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
    repeat_until?: string
    remind_before_minutes?: number | null
  }
): Promise<ApiResult<{ success: boolean; data: PersonalEvent[] }>> =>
  apiPost<{ success: boolean; data: PersonalEvent[] }>('/personal-events', body, { token })

export const updatePersonalEvent = (
  token: string,
  eventId: string,
  body: Partial<{
    title: string
    description: string | null
    start_time: string
    end_time: string | null
    location: string | null
    remind_before_minutes: number | null
  }>
): Promise<ApiResult<{ success: boolean }>> =>
  apiPatch<{ success: boolean }>(`/personal-events/${eventId}`, body, { token })

export const deletePersonalEvent = (
  token: string,
  eventId: string,
  options: { series?: 'all' } = {}
): Promise<ApiResult<{ success: boolean }>> => {
  const qs = options.series === 'all' ? '?series=all' : ''
  return apiDelete<{ success: boolean }>(`/personal-events/${eventId}${qs}`, { token })
}
