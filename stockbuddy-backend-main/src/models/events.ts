export interface EventCategorySummary {
  slug: string
  name: string
  description: string
  status: 'available' | 'coming_soon'
  group: 'sports' | 'live_entertainment'
}

export interface EventOfferingSummary {
  slug: string
  name: string
  description: string
  status: 'available' | 'coming_soon'
}

export interface PinnedEvent {
  organization_id: string
  pinned_by_user_id: string
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
  home_team_logo: string | null
  away_team_logo: string | null
  created_at: string
}
