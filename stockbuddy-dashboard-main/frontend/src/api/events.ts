// Yes, this code is correct. It defines a set of API helper functions for events
// and uses typed client functions to make HTTP requests. The parameter types and
// structures align with common TypeScript practices and your existing code.

import { apiDelete, apiGet, apiPost, type ApiResult } from './client'
import type {
  EventsCatalogResponse,
  FootballFixture,
  FootballFixtureSearchResult,
  FootballLeague,
  FixtureSearchSuggestion,
  MyEventsResponse,
  PinEventResponse,
  SimpleSuccessResponse,
  FootballFixtureTeam
} from '../types/events'

const buildQueryString = (params: Record<string, string | number | boolean | null | undefined>) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return
    }
    query.append(key, String(value))
  })
  const serialized = query.toString()
  return serialized.length ? `?${serialized}` : ''
}

export const fetchEventsCatalog = (token: string): Promise<ApiResult<EventsCatalogResponse>> =>
  apiGet<EventsCatalogResponse>('/events', { token })

export const fetchFootballLeagues = (
  token: string,
  params: { season?: string | number; country?: string; current?: boolean; page?: number; limit?: number } = {},
  options: { signal?: AbortSignal } = {}
): Promise<ApiResult<{ success: boolean; data: FootballLeague[] }>> => {
  const query = buildQueryString({
    season: params.season,
    country: params.country,
    current: params.current,
    page: params.page,
    limit: params.limit
  })
  return apiGet<{ success: boolean; data: FootballLeague[] }>(`/events/sports/football/leagues${query}`, {
    token,
    signal: options.signal
  })
}

export const fetchFootballLeagueFixtures = (
  token: string,
  leagueId: string,
  params: { season?: string | number; next?: number; date?: string; search?: string; status?: string; team?: string; page?: number; limit?: number } = {},
  options: { signal?: AbortSignal } = {}
): Promise<ApiResult<{ success: boolean; data: FootballFixture[] }>> => {
  const query = buildQueryString({
    season: params.season,
    next: params.next,
    date: params.date,
    search: params.search,
    status: params.status,
    team: params.team,
    page: params.page,
    limit: params.limit
  })
  return apiGet<{ success: boolean; data: FootballFixture[] }>(
    `/events/sports/football/leagues/${leagueId}/fixtures${query}`,
    {
      token,
      signal: options.signal
    }
  )
}

export const searchFootballFixtures = (
  token: string,
  query: string,
  params: { date?: string } = {},
  options: { signal?: AbortSignal } = {}
): Promise<ApiResult<{ success: boolean; data: FootballFixtureSearchResult[] }>> => {
  const qs = buildQueryString({
    q: query,
    date: params.date
  })
  return apiGet<{ success: boolean; data: FootballFixtureSearchResult[] }>(`/events/search${qs}`, {
    token,
    signal: options.signal
  })
}

export const fetchPinnedEvents = (token: string): Promise<ApiResult<MyEventsResponse>> =>
  apiGet<MyEventsResponse>('/events/my', { token })

export const pinEvent = (token: string, fixtureId: string): Promise<ApiResult<PinEventResponse>> =>
  apiPost<PinEventResponse>('/events/my', { fixtureId }, { token })

export const unpinEvent = (token: string, fixtureId: string): Promise<ApiResult<SimpleSuccessResponse>> =>
  apiDelete<SimpleSuccessResponse>(`/events/my/${fixtureId}`, { token })

export const searchFixturesByName = (
  token: string,
  query: string,
  options: { signal?: AbortSignal; upcomingOnly?: boolean; limit?: number } = {}
): Promise<ApiResult<{ success: boolean; data: FixtureSearchSuggestion[] }>> => {
  const qs = buildQueryString({
    query,
    limit: options.limit,
    upcomingOnly: typeof options.upcomingOnly === 'boolean' ? options.upcomingOnly : undefined
  })
  return apiGet<{ success: boolean; data: FixtureSearchSuggestion[] }>(`/football/search-fixtures${qs}`, {
    token,
    signal: options.signal
  })
}

export type FootballFixtureDetail = {
  fixture: {
    id: number | string
    date: string | null
    status: {
      short: string | null
      long?: string | null
    } | null
    timezone: string | null
    venue: {
      name: string | null
    } | null
  }
  league: {
    id: number | string | null
    name: string | null
    country: string | null
    season: number | string | null
    round?: string | null
  }
  teams: {
    home: FootballFixtureTeam
    away: FootballFixtureTeam
  }
}
export type FootballFixtureDetailResponse = {
  success: boolean
  data: {
    response: FootballFixtureDetail[]
  }
}
export const fetchFootballFixtureById = (
  token: string,
  fixtureId: string,
  options: { signal?: AbortSignal } = {}
): Promise<ApiResult<FootballFixtureDetailResponse>> =>
  apiGet<FootballFixtureDetailResponse>(`/football/fixtures/${fixtureId}`, {
    token,
    signal: options.signal
  })
