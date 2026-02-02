export type EventStatus = 'available' | 'coming_soon'

export type EventCategory = {
  slug: string
  name: string
  description: string
  status: EventStatus
  group: 'sports' | 'live_entertainment'
}

export type EventOffering = {
  slug: string
  name: string
  description: string
  status: EventStatus
}

export type EventsCatalogResponse = {
  success: boolean
  data: {
    categories: EventCategory[]
    sports: EventOffering[]
    entertainment: EventOffering[]
  }
}

export type FootballLeague = {
  id: string
  name: string
  type: string | null
  logo: string | null
  country: string | null
  countryCode: string | null
  season: number | string | null
  seasons: Array<number | string>
}

export type FootballFixtureTeam = {
  name: string | null
  logo: string | null
  slug?: string | null
}

export type FootballFixture = {
  id: string
  date: string | null
  status: string | null
  timezone: string | null
  venue: string | null
  referee: string | null
  league: {
    id: string | null
    name: string | null
    round: string | null
    season: number | string | null
    country: string | null
  }
  teams: {
    home: string
    away: string
    homeLogo: string
    awayLogo: string
  }
}

export type FootballFixtureSearchResult = {
  id: string
  title: string
  date: string | null
  status: string | null
  venue: string | null
  league: FootballFixture['league']
  teams: FootballFixture['teams']
  homeLogo?: string | null
  awayLogo?: string | null
}

export type FixtureSearchSuggestion = {
  id: string
  home_team: string
  away_team: string
  date: string | null
  home_logo?: string | null
  away_logo?: string | null
}

export type PinnedEvent = {
  fixture_id: string
  title: string
  league_id: string | null
  league_name: string | null
  season: string | null
  country: string | null
  event_date: string | null
  status: string | null
  venue_name: string | null
  home_team: string | null
  away_team: string | null
  home_logo?: string | null
  away_logo?: string | null
  home_team_logo?: string | null
  away_team_logo?: string | null
  created_at: string
}

export type MyEventsResponse = {
  success: boolean
  data: PinnedEvent[]
}

export type PinEventResponse = {
  success: boolean
  data: PinnedEvent
}

export type SimpleSuccessResponse = {
  success: boolean
}
