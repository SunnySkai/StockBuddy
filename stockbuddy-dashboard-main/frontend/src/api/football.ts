import { apiGet, type ApiResult } from './client'
import type { TeamSearchResult } from '../types/football'

export type TeamSearchResponse = {
  success: boolean
  data: TeamSearchResult[]
}

export const searchTeams = (
  token: string,
  query: string,
  options?: { limit?: number }
): Promise<ApiResult<TeamSearchResponse>> => {
  const params = new URLSearchParams()
  params.set('query', query)
  if (options?.limit) {
    params.set('limit', String(options.limit))
  }
  return apiGet<TeamSearchResponse>(`/football/teams/search?${params.toString()}`, { token })
}
