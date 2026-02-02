import {
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { PinnedEvent } from '../models/events'
import { organizationPk } from './organization'

const TABLE_NAME = process.env.TABLE_NAME
const client = new DynamoDBClient({ region: process.env.AWS_REGION })

const pinnedEventSk = (fixtureId: string) => `PINNED_EVENT#${fixtureId}`

const normalizePinnedEvent = (raw: any, organizationIdFallback?: string): PinnedEvent => {
  const event = raw as PinnedEvent & {
    organization_id?: string
    pinned_by_user_id?: string
    league_id?: string | null
    league_name?: string | null
    season?: string | null
    country?: string | null
    event_date?: string | null
    status?: string | null
    venue_name?: string | null
    home_team?: string | null
    away_team?: string | null
    home_team_logo?: string | null
    away_team_logo?: string | null
  }

  return {
    organization_id: event.organization_id ?? organizationIdFallback ?? '',
    pinned_by_user_id: event.pinned_by_user_id ?? (raw?.pinned_by_user_id ?? raw?.user_id ?? ''),
    fixture_id: event.fixture_id,
    title: event.title,
    league_id: event.league_id ?? null,
    league_name: event.league_name ?? null,
    season: event.season ?? null,
    country: event.country ?? null,
    event_date: event.event_date ?? null,
    status: event.status ?? null,
    venue_name: event.venue_name ?? null,
    home_team: event.home_team ?? null,
    away_team: event.away_team ?? null,
    home_team_logo: event.home_team_logo ?? null,
    away_team_logo: event.away_team_logo ?? null,
    created_at: event.created_at ?? new Date(0).toISOString()
  }
}

export const listPinnedEvents = async (tenant: string, organizationId: string): Promise<PinnedEvent[]> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: marshall({
      ':pk': organizationPk(tenant, organizationId),
      ':skPrefix': 'PINNED_EVENT#'
    })
  }))

  const items = response.Items?.map((item) => normalizePinnedEvent(unmarshall(item), organizationId)) ?? []
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export const savePinnedEvent = async (tenant: string, organizationId: string, event: PinnedEvent): Promise<void> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const now = new Date().toISOString()
  const createdAt = event.created_at ?? now
  const {
    created_at: _ignored,
    organization_id: _orgIgnored,
    pinned_by_user_id: _pinnedByIgnored,
    ...rest
  } = event

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: pinnedEventSk(event.fixture_id),
      entity_type: 'ORGANIZATION_PINNED_EVENT',
      tenant,
      organization_id: organizationId,
      pinned_by_user_id: event.pinned_by_user_id,
      created_at: createdAt,
      updated_at: now,
      ...rest
    }),
    ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
  }))
}

export const removePinnedEvent = async (tenant: string, organizationId: string, fixtureId: string): Promise<void> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  await client.send(new DeleteItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: pinnedEventSk(fixtureId)
    })
  }))
}
