import express, { Response } from 'express'
import { requireLoggedInUser } from '../../decorators/require_param'
import { Request } from '../../models/request'
import { apiFootballClient } from '../../services/api_football'

const route = express.Router()

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return undefined
}

const toPositiveInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number(value)
    if (!Number.isNaN(parsed) && Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }
  return undefined
}

const handleError = (res: Response, error: unknown): void => {
  const message = error instanceof Error ? error.message : 'Unexpected error'
  res.status(500).json({ success: false, message })
}

const determineCurrentSeason = (): string => {
  const now = new Date()
  const month = now.getUTCMonth() + 1
  const year = now.getUTCFullYear()
  return String(month >= 7 ? year : year - 1)
}

const formatDateOnly = (date: Date): string => date.toISOString().split('T')[0]

const determineSeasonDateRange = (season: string): { from: string; to: string } => {
  const parsed = Number(season)
  const year = Number.isNaN(parsed) ? new Date().getUTCFullYear() : parsed
  const start = new Date(Date.UTC(year, 6, 1)) // July 1
  const end = new Date(Date.UTC(year + 1, 5, 30)) // June 30 next year
  return {
    from: formatDateOnly(start),
    to: formatDateOnly(end)
  }
}

type FixtureSuggestion = {
  id: string
  home_team_id: string
  home_team: string
  away_team: string
  date: string | null
  home_logo: string | null
  away_logo: string | null
}

type TeamSearchResult = {
  id: string
  name: string
  logo: string | null
  country: string | null
  founded: number | null
}

const normalizeFixtureSuggestion = (fixture: any): FixtureSuggestion | null => {
  const fixtureMeta = fixture?.fixture ?? {}
  const teams = fixture?.teams ?? {}
  const home = teams?.home?.name ?? null
  const homeId = teams?.home?.id ?? null
  const away = teams?.away?.name ?? null
  const id = fixtureMeta?.id ?? fixture?.id

  if (!id || typeof home !== 'string' || typeof away !== 'string') {
    return null
  }

  return {
    id: String(id),
    home_team_id: homeId,
    home_team: home,
    away_team: away,
    date: fixtureMeta?.date ?? null,
    home_logo: typeof teams?.home?.logo === 'string' ? teams.home.logo : null,
    away_logo: typeof teams?.away?.logo === 'string' ? teams.away.logo : null
  }
}

const normalizeTeamSearchResult = (entry: any): TeamSearchResult | null => {
  const team = entry?.team ?? entry
  const id = team?.id ?? entry?.id
  const name = team?.name ?? entry?.name
  if (!id || typeof name !== 'string') {
    return null
  }
  const country = typeof team?.country === 'string'
    ? team.country
    : (typeof entry?.country === 'string' ? entry.country : null)
  const logo = typeof team?.logo === 'string' ? team.logo : (typeof entry?.logo === 'string' ? entry.logo : null)
  const founded = typeof team?.founded === 'number' ? team.founded : null

  return {
    id: String(id),
    name,
    logo: logo ?? null,
    country: country ?? null,
    founded
  }
}

route.get(
  '/fixtures',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const date = toOptionalString(req.query.date)
    const league = toOptionalString(req.query.league)
    const season = toOptionalString(req.query.season)
    const team = toOptionalString(req.query.team)
    const timezone = toOptionalString(req.query.timezone)
    const status = toOptionalString(req.query.status)
    const live = toOptionalString(req.query.live)
    const fixture = toOptionalString(req.query.fixture)

    if (!date && !team && !league && !fixture && !live) {
      res.status(400).json({
        success: false,
        message: 'Provide at least one filter: date, team, league, fixture, or live'
      })
      return
    }

    try {
      const response = await apiFootballClient.getFixtures(
        {
          date,
          league,
          season,
          team,
          timezone,
          status,
          live,
          fixture
        },
        {
          ttlMs: live ? 30_000 : undefined
        }
      )

      res.json({ success: true, data: response })
    } catch (error) {
      handleError(res, error)
    }
  }
)

route.get(
  '/fixtures/:fixtureId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const fixtureId = toOptionalString(req.params.fixtureId)
    if (!fixtureId) {
      res.status(400).json({ success: false, message: 'fixtureId is required' })
      return
    }

    try {
      const response = await apiFootballClient.getFixtureById(fixtureId)
      res.json({ success: true, data: response })
    } catch (error) {
      handleError(res, error)
    }
  }
)

route.get(
  '/fixtures/:fixtureId/events',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const fixtureId = toOptionalString(req.params.fixtureId)
    const team = toOptionalString(req.query.team)
    const player = toOptionalString(req.query.player)
    const type = toOptionalString(req.query.type)

    if (!fixtureId) {
      res.status(400).json({ success: false, message: 'fixtureId is required' })
      return
    }

    try {
      const response = await apiFootballClient.getFixtureEvents(
        {
          fixture: fixtureId,
          team,
          player,
          type
        },
        {
          ttlMs: 15_000
        }
      )

      res.json({ success: true, data: response })
    } catch (error) {
      handleError(res, error)
    }
  }
)

route.get(
  '/search-fixtures',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const query = toOptionalString(req.query.query) ?? toOptionalString(req.query.q)
    if (!query || query.length < 2) {
      res.status(400).json({ success: false, message: 'query must be at least 2 characters' })
      return
    }

    const limit = Math.min(toPositiveInteger(req.query.limit) ?? 20, 50)
    const providedSeason = toOptionalString(req.query.season)
    const season = providedSeason ?? determineCurrentSeason()
    const { from: defaultFrom, to: defaultTo } = determineSeasonDateRange(season)
    const dateFrom = toOptionalString(req.query.from) ?? defaultFrom
    const dateTo = toOptionalString(req.query.to) ?? defaultTo
    const upcomingOnly = toBoolean(req.query.upcomingOnly ?? req.query.upcoming ?? req.query.onlyUpcoming) ?? false
    const upcomingCutoff = new Date()
    const normalizedQuery = query.toLowerCase()

    try {
      const teamsResponse = await apiFootballClient.getTeams<any>({ search: query })
      const teams = Array.isArray(teamsResponse?.response) ? teamsResponse.response : []
      if (!teams.length) {
        res.json({ success: true, data: [] })
        return
      }

      const suggestions: FixtureSuggestion[] = []
      const seen = new Set<string>()
      for (const team of teams) {
        if (suggestions.length >= limit) {
          break
        }
        const teamId = team?.team?.id
        if (!teamId) {
          continue
        }

        try {
          const fixtureQuery = {
            team: teamId,
            season,
            from: dateFrom,
            to: dateTo
          }

          if (upcomingOnly) {
            fixtureQuery.from = formatDateOnly(upcomingCutoff)
          }

          const fixturesResponse = await apiFootballClient.getFixtures<any>(fixtureQuery)
          const fixtures = Array.isArray(fixturesResponse?.response) ? fixturesResponse.response : []
          for (const fixture of fixtures) {
            if (suggestions.length >= limit) {
              break
            }
            const normalized = normalizeFixtureSuggestion(fixture)
            if (!normalized) {
              continue
            }
            if (upcomingOnly) {
              const fixtureTimestamp = normalized.date ? Date.parse(normalized.date) : Number.NaN
              if (Number.isNaN(fixtureTimestamp) || fixtureTimestamp < upcomingCutoff.getTime()) {
                continue
              }
            }
            const home = normalized.home_team.toLowerCase()
            const away = normalized.away_team.toLowerCase()
            if (!home.includes(normalizedQuery) && !away.includes(normalizedQuery)) {
              continue
            }
            if (seen.has(normalized.id)) {
              continue
            }
            seen.add(normalized.id)
            suggestions.push(normalized)
          }
        } catch (error) {
          console.warn(`Failed to fetch fixtures for team ${teamId}:`, error)
        }
      }

      res.json({ success: true, data: suggestions.slice(0, limit) })
    } catch (error) {
      handleError(res, error)
    }
  }
)

route.get(
  '/teams/search',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const query = toOptionalString(req.query.query ?? req.query.q)
    if (!query) {
      res.status(400).json({ success: false, message: 'query is required.' })
      return
    }
    const limit = Math.min(toPositiveInteger(req.query.limit) ?? 15, 30)

    try {
      const response = await apiFootballClient.getTeams<any>({ search: query })
      const teams = Array.isArray(response?.response) ? response.response : []
      const normalized = teams
        .map((entry) => normalizeTeamSearchResult(entry))
        .filter((entry): entry is TeamSearchResult => entry !== null)
        .slice(0, limit)
      res.json({ success: true, data: normalized })
    } catch (error) {
      handleError(res, error)
    }
  }
)

export = route
