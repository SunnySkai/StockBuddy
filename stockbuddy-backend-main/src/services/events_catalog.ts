import { EventCategorySummary, EventOfferingSummary } from '../models/events'

const sportsOfferings: EventOfferingSummary[] = [
  {
    slug: 'football',
    name: 'Football',
    description: 'Global leagues, live scores, and match insights from API-Football.',
    status: 'available'
  },
  {
    slug: 'basketball',
    name: 'Basketball',
    description: 'NBA, EuroLeague, and more. Integrations coming soon.',
    status: 'coming_soon'
  },
  {
    slug: 'baseball',
    name: 'Baseball',
    description: 'MLB and international matchups planned for future release.',
    status: 'coming_soon'
  }
]

const entertainmentOfferings: EventOfferingSummary[] = [
  {
    slug: 'concerts',
    name: 'Live Entertainment',
    description: 'Concerts, festivals, and cultural events integration roadmap.',
    status: 'coming_soon'
  }
]

const eventCategories: EventCategorySummary[] = [
  {
    slug: 'sports',
    name: 'Sports',
    description: 'Competitive sporting events across leagues and tournaments.',
    status: 'available',
    group: 'sports'
  },
  {
    slug: 'live-entertainment',
    name: 'Live Entertainment',
    description: 'Concerts, theatre, and cultural experiences.',
    status: 'coming_soon',
    group: 'live_entertainment'
  }
]

export const getEventCategories = (): EventCategorySummary[] => {
  return eventCategories
}

export const getSportsOfferings = (): EventOfferingSummary[] => {
  return sportsOfferings
}

export const getEntertainmentOfferings = (): EventOfferingSummary[] => {
  return entertainmentOfferings
}
