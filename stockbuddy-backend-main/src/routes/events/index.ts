import express, { Response } from 'express'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { requireLoggedInUser, requireStringParam } from '../../decorators/require_param'
import { AuthenticatedRequest, Request } from '../../models/request'
import { ApiFootballRequestError, apiFootballClient } from '../../services/api_football'
import { getEntertainmentOfferings, getEventCategories, getSportsOfferings } from '../../services/events_catalog'
import { listPinnedEvents, removePinnedEvent, savePinnedEvent } from '../../daos/pinned_events'
import { PinnedEvent } from '../../models/events'

const route = express.Router()

const toOptionalString = (value: unknown): string | undefined => {
  const normalized = Array.isArray(value) ? value[0] : value
  if (typeof normalized !== 'string') {
    return undefined
  }
  const trimmed = normalized.trim()
  return trimmed.length ? trimmed : undefined
}

const toBoolean = (value: unknown): boolean | undefined => {
  const normalized = Array.isArray(value) ? value[0] : value
  if (typeof normalized === 'boolean') {
    return normalized
  }
  if (typeof normalized === 'string') {
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return undefined
}

const toPositiveInteger = (value: unknown): number | undefined => {
  const normalized = Array.isArray(value) ? value[0] : value
  if (typeof normalized === 'number' && Number.isInteger(normalized) && normalized > 0) {
    return normalized
  }
  if (typeof normalized === 'string') {
    const parsed = parseInt(normalized, 10)
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed
    }
  }
  return undefined
}

const handleError = (res: Response, error: unknown): void => {
  if (error instanceof ApiFootballRequestError) {
    res.status(error.statusCode || 502).json({
      success: false,
      message: error.message
    })
    return
  }

  const message = error instanceof Error ? error.message : 'Unexpected error'
  res.status(500).json({ success: false, message })
}

const buildPinnedEvent = (
  fixture: any,
  organizationId: string,
  pinnedByUserId: string
): PinnedEvent => {
  const fixtureMeta = fixture?.fixture ?? {}
  const league = fixture?.league ?? {}
  const teams = fixture?.teams ?? {}
  const rawId = fixtureMeta?.id ?? fixture?.id

  if (!rawId) {
    throw new Error('Fixture payload missing id')
  }

  const homeTeam = teams?.home?.name ?? null
  const awayTeam = teams?.away?.name ?? null
  const titleCandidates = [
    homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : null,
    league?.name ?? null
  ].filter(Boolean) as string[]

  const createdAt = new Date().toISOString()
  const fixtureId = String(rawId)

  return {
    organization_id: organizationId,
    pinned_by_user_id: pinnedByUserId,
    fixture_id: fixtureId,
    title: titleCandidates[0] ?? `Fixture ${fixtureMeta?.id ?? ''}`,
    league_id: league?.id ? String(league.id) : null,
    league_name: league?.name ?? null,
    season: league?.season ? String(league.season) : null,
    country: league?.country ?? null,
    event_date: fixtureMeta?.date ?? null,
    status: fixtureMeta?.status?.long ?? fixtureMeta?.status?.short ?? null,
    venue_name: fixtureMeta?.venue?.name ?? null,
    home_team: homeTeam,
    away_team: awayTeam,
    home_team_logo: teams?.home?.logo ?? null,
    away_team_logo: teams?.away?.logo ?? null,
    created_at: createdAt
  }
}

route.get(
  '/',
  requireLoggedInUser(),
  async (_req: Request, res: Response): Promise<void> => {
    res.json({
      success: true,
      data: {
        categories: getEventCategories(),
        sports: getSportsOfferings(),
        entertainment: getEntertainmentOfferings()
      }
    })
  }
)

route.get(
  '/sports',
  requireLoggedInUser(),
  async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: getSportsOfferings() })
  }
)

route.get(
  '/sports/football/leagues',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const season = toOptionalString(req.query.season) ?? String(new Date().getFullYear())
    const country = toOptionalString(req.query.country)
    const current = toBoolean(req.query.current)

    try {
      const response = await apiFootballClient.getLeagues<any>(
        {
          season,
          country,
          current: typeof current === 'boolean' ? current : undefined,
          type: 'league'
        },
        {
          ttlMs: 12 * 60 * 60 * 1000
        }
      )

      const leagues = (response?.response ?? []).map((item: any) => {
        const league = item?.league ?? {}
        const countryInfo = item?.country ?? {}
        const seasons = Array.isArray(item?.seasons) ? item.seasons : []
        const activeSeason = seasons.find((s: any) => s?.current) ?? seasons[0]

        return {
          id: league?.id ? String(league.id) : undefined,
          name: league?.name ?? 'Unknown league',
          type: league?.type ?? null,
          logo: league?.logo ?? null,
          country: countryInfo?.name ?? null,
          countryCode: countryInfo?.code ?? null,
          season: activeSeason?.year ?? null,
          seasons: seasons
            .map((s: any) => s?.year)
            .filter((year: any) => typeof year === 'number' || typeof year === 'string')
        }
      }).filter((league: any) => league.id)

      res.json({ success: true, data: leagues })
    } catch (error) {
      handleError(res, error)
    }
  }
)

route.get(
  '/sports/football/leagues/:leagueId/fixtures',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const leagueId = toOptionalString(req.params.leagueId)
    const season = toOptionalString(req.query.season)
    const date = toOptionalString(req.query.date)
    const search = toOptionalString(req.query.search)
    const team = toOptionalString(req.query.team)

    if (!leagueId) {
      res.status(400).json({ success: false, message: 'leagueId is required' })
      return
    }

    try {
      const response = await apiFootballClient.getFixtures<any>(
        {
          league: leagueId,
          season,
          date,
          search,
          team
        },
        {
          ttlMs: date ? 5 * 60 * 1000 : 90_000
        }
      )

      const fixtures = (response?.response ?? []).map((item: any) => {
        const fixtureMeta = item?.fixture ?? {}
        const league = item?.league ?? {}
        const teams = item?.teams ?? {}

        return {
          id: fixtureMeta?.id ? String(fixtureMeta.id) : undefined,
          date: fixtureMeta?.date ?? null,
          status: fixtureMeta?.status?.long ?? fixtureMeta?.status?.short ?? null,
          timezone: fixtureMeta?.timezone ?? null,
          venue: fixtureMeta?.venue?.name ?? null,
          referee: fixtureMeta?.referee ?? null,
          league: {
            id: league?.id ? String(league.id) : null,
            name: league?.name ?? null,
            round: league?.round ?? null,
            season: league?.season ?? null,
            country: league?.country ?? null
          },
          teams: {
            home: teams?.home?.name ?? null,
            away: teams?.away?.name ?? null,
            homeLogo: teams?.home?.logo ?? null,
            awayLogo: teams?.away?.logo ?? null
          }
        }
      }).filter((fixture: any) => fixture.id)

      res.json({ success: true, data: fixtures })
    } catch (error) {
      handleError(res, error)
    }
  }
)

route.get(
  '/sports/football/fixtures/upcoming',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const leagueId = toOptionalString(req.query.leagueId ?? req.query.league)
    const teamId = toOptionalString(req.query.teamId ?? req.query.team)
    const season = toOptionalString(req.query.season)
    const timezone = toOptionalString(req.query.timezone)
    const requestedNext = toPositiveInteger(req.query.next ?? req.query.count ?? req.query.limit)
    const next = Math.min(requestedNext ?? 10, 50)

    if (!leagueId && !teamId) {
      res.status(400).json({ success: false, message: 'leagueId or teamId is required' })
      return
    }

    try {
      const response = await apiFootballClient.getFixtures<any>(
        {
          league: leagueId ?? undefined,
          team: teamId ?? undefined,
          season: season ?? undefined,
          timezone: timezone ?? undefined,
          next
        },
        {
          ttlMs: 90_000
        }
      )

      const fixtures = (response?.response ?? []).map((item: any) => {
        const fixtureMeta = item?.fixture ?? {}
        const league = item?.league ?? {}
        const teams = item?.teams ?? {}

        return {
          id: fixtureMeta?.id ? String(fixtureMeta.id) : undefined,
          date: fixtureMeta?.date ?? null,
          status: fixtureMeta?.status?.long ?? fixtureMeta?.status?.short ?? null,
          timezone: fixtureMeta?.timezone ?? null,
          venue: fixtureMeta?.venue?.name ?? null,
          referee: fixtureMeta?.referee ?? null,
          league: {
            id: league?.id ? String(league.id) : null,
            name: league?.name ?? null,
            round: league?.round ?? null,
            season: league?.season ?? null,
            country: league?.country ?? null
          },
          teams: {
            home: teams?.home?.name ?? null,
            away: teams?.away?.name ?? null,
            homeLogo: teams?.home?.logo ?? null,
            awayLogo: teams?.away?.logo ?? null
          }
        }
      }).filter((fixture: any) => fixture.id)

      res.json({ success: true, data: fixtures })
    } catch (error) {
      handleError(res, error)
    }
  }
)

route.get(
  '/search',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const query = toOptionalString(req.query.q) ?? toOptionalString(req.query.query)
    const date = toOptionalString(req.query.date)

    if (!query) {
      res.status(400).json({ success: false, message: 'q is required' })
      return
    }

    try {
      const response = await apiFootballClient.searchFixtures<any>(query, { date })
      const fixtures = (response?.response ?? [])
        // Removed the status filter to get every fixture, not just "Not Started"
        .map((item: any) => {
          const fixtureMeta = item?.fixture ?? {}
          const league = item?.league ?? {}
          const teams = item?.teams ?? {}

          return {
            id: fixtureMeta?.id ? String(fixtureMeta.id) : undefined,
            title: [
              teams?.home?.name,
              teams?.away?.name ? `vs ${teams?.away?.name}` : null
            ].filter(Boolean).join(' ') || league?.name || `Fixture ${fixtureMeta?.id ?? ''}`,
            date: fixtureMeta?.date ?? null,
            league: {
              id: league?.id ? String(league.id) : null,
              name: league?.name ?? null,
              season: league?.season ?? null,
              country: league?.country ?? null
            },
            teams: {
              home: teams?.home?.name ?? null,
              away: teams?.away?.name ?? null,
              homeLogo: teams?.home?.logo ?? null,
              awayLogo: teams?.away?.logo ?? null
            }
          }
        })
        .filter((fixture: any) => fixture.id)

      res.json({ success: true, data: fixtures })
    } catch (error) {
      handleError(res, error)
    }
  }
)

route.get(
  '/my',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const authRequest = req as AuthenticatedRequest
    const user = authRequest.user

    if (!user) {
      res.status(401).json({ success: false, message: 'Access denied.' })
      return
    }

    const tenant = req.tenant ?? ''
    const organizationId = user.organization_id

    if (!organizationId) {
      res.status(400).json({ success: false, message: 'Organization membership required to access pinned fixtures' })
      return
    }

    try {
      const events = await listPinnedEvents(tenant, organizationId)
      res.json({ success: true, data: events })
    } catch (error) {
      handleError(res, error)
    }
  }
)

route.post(
  '/my',
  requireLoggedInUser(),
  requireStringParam('fixtureId', (value: string) => !!value.trim().length),
  async (req: Request, res: Response): Promise<void> => {
    const authRequest = req as AuthenticatedRequest
    const user = authRequest.user

    if (!user) {
      res.status(401).json({ success: false, message: 'Access denied.' })
      return
    }

    const fixtureId = String(req.body.fixtureId).trim()
    const tenant = req.tenant ?? ''
    const organizationId = user.organization_id

    if (!organizationId) {
      res.status(400).json({ success: false, message: 'Organization membership required to pin fixtures' })
      return
    }

    try {
      const fixtureResponse = await apiFootballClient.getFixtureById<any>(fixtureId, { ttlMs: 60_000 })
      const fixture = Array.isArray(fixtureResponse?.response) ? fixtureResponse.response[0] : null

      if (!fixture) {
        res.status(404).json({ success: false, message: 'Fixture not found' })
        return
      }

      const pinned = buildPinnedEvent(fixture, organizationId, user.id)
      await savePinnedEvent(tenant, organizationId, pinned)

      res.status(201).json({ success: true, data: pinned })
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        res.status(409).json({ success: false, message: 'Fixture already pinned' })
        return
      }
      handleError(res, error)
    }
  }
)

route.delete(
  '/my/:fixtureId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const authRequest = req as AuthenticatedRequest
    const user = authRequest.user

    if (!user) {
      res.status(401).json({ success: false, message: 'Access denied.' })
      return
    }

    const fixtureId = toOptionalString(req.params.fixtureId)
    if (!fixtureId) {
      res.status(400).json({ success: false, message: 'fixtureId is required' })
      return
    }

    const tenant = req.tenant ?? ''
    const organizationId = user.organization_id

    if (!organizationId) {
      res.status(400).json({ success: false, message: 'Organization membership required to remove pinned fixtures' })
      return
    }

    try {
      await removePinnedEvent(tenant, organizationId, fixtureId)
      res.json({ success: true })
    } catch (error) {
      handleError(res, error)
    }
  }
)

export = route
