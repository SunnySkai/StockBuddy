import {
  DeleteItemCommand,
  DynamoDBClient,
  BatchWriteItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import pLimit from 'p-limit'
import { PersonalEvent, PersonalEventRepeat } from '../models/personal_event'
import { userPk } from './user'

const TABLE_NAME = process.env.TABLE_NAME
const client = new DynamoDBClient({ region: process.env.AWS_REGION })

const CONCURRENCY = 10
const limit = pLimit(CONCURRENCY)

const personalEventSk = (eventId: string) => `PERSONAL_EVENT#${eventId}`

const normalizePersonalEvent = (raw: any): PersonalEvent => {
  const event = raw as PersonalEvent & {
    description?: string | null
    end_time?: string | null
    location?: string | null
    repeat?: PersonalEventRepeat | null
    parent_event_id?: string | null
    remind_before_minutes?: number | null
    reminder_at?: string | null
    reminder_sent_at?: string | null
  }

  return {
    id: event.id,
    user_id: event.user_id,
    title: event.title,
    description: event.description ?? null,
    start_time: event.start_time,
    end_time: event.end_time ?? null,
    location: event.location ?? null,
    repeat: event.repeat ?? 'none',
    parent_event_id: event.parent_event_id ?? null,
    remind_before_minutes: event.remind_before_minutes ?? null,
    reminder_at: event.reminder_at ?? null,
    reminder_sent_at: event.reminder_sent_at ?? null,
    created_at: event.created_at,
    updated_at: event.updated_at
  }
}

export const createPersonalEvent = async (
  tenant: string,
  input: Omit<PersonalEvent, 'created_at' | 'updated_at'>
): Promise<PersonalEvent> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const now = new Date().toISOString()
  const item: PersonalEvent = {
    ...input,
    created_at: now,
    updated_at: now
  }

  const reminderIndex: Record<string, any> = {}
  if (item.reminder_at) {
    reminderIndex.PK4 = `REMINDER#${tenant}`
    reminderIndex.SK4 = item.reminder_at
  }

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall({
      PK: userPk(tenant, item.user_id),
      SK: personalEventSk(item.id),
      entity_type: 'USER_PERSONAL_EVENT',
      tenant,
      ...item,
      ...reminderIndex
    })
  }))

  return item
}

export const listPersonalEventsForUser = async (
  tenant: string,
  userId: string,
  options: { from?: string; to?: string } = {}
): Promise<PersonalEvent[]> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const pk = userPk(tenant, userId)
  const query: any = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: marshall({
      ':pk': pk,
      ':skPrefix': 'PERSONAL_EVENT#'
    })
  }

  const response = await client.send(new QueryCommand(query))
  let items = response.Items?.map(item => normalizePersonalEvent(unmarshall(item))) ?? []

  if (options.from || options.to) {
    items = items.filter(event => {
      const dateKey = event.start_time.split('T')[0]
      if (options.from && dateKey < options.from) return false
      if (options.to && dateKey > options.to) return false
      return true
    })
  }

  return items.sort((a, b) => a.start_time.localeCompare(b.start_time))
}

export const getPersonalEventById = async (
  tenant: string,
  userId: string,
  eventId: string
): Promise<PersonalEvent | null> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: marshall({
      ':pk': userPk(tenant, userId),
      ':sk': personalEventSk(eventId)
    })
  }))

  const item = response.Items?.[0]
  return item ? normalizePersonalEvent(unmarshall(item)) : null
}

export const updatePersonalEvent = async (
  tenant: string,
  userId: string,
  eventId: string,
  updates: Partial<Pick<PersonalEvent,
    'title' |
    'description' |
    'start_time' |
    'end_time' |
    'location' |
    'repeat' |
    'remind_before_minutes' |
    'reminder_at'
  >>
): Promise<void> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const now = new Date().toISOString()
  const updateKeys = Object.keys(updates)
  if (!updateKeys.length) {
    return
  }

  const setExpressions: string[] = []
  const removeExpressions: string[] = []
  const expressionAttributeNames: Record<string, string> = {}
  const expressionAttributeValues: Record<string, any> = {}

  updateKeys.forEach((key) => {
    const nameKey = `#${key}`
    const valueKey = `:${key}`
    expressionAttributeNames[nameKey] = key
    expressionAttributeValues[valueKey] = (updates as any)[key]
    setExpressions.push(`${nameKey} = ${valueKey}`)
  })

  setExpressions.push('#updated_at = :updated_at')
  expressionAttributeNames['#updated_at'] = 'updated_at'
  expressionAttributeValues[':updated_at'] = now

  // Maintain reminder GSI keys (PK4/SK4) when reminder_at changes
  if (Object.prototype.hasOwnProperty.call(updates, 'reminder_at')) {
    const hasReminder = updates.reminder_at
    if (hasReminder) {
      setExpressions.push('#PK4 = :pk4', '#SK4 = :sk4')
      expressionAttributeNames['#PK4'] = 'PK4'
      expressionAttributeNames['#SK4'] = 'SK4'
      expressionAttributeValues[':pk4'] = `REMINDER#${tenant}`
      expressionAttributeValues[':sk4'] = updates.reminder_at
    } else {
      // If reminder_at cleared, remove PK4/SK4
      removeExpressions.push('PK4', 'SK4')
    }
  }

  let updateExpression = `SET ${setExpressions.join(', ')}`
  if (removeExpressions.length) {
    updateExpression += ` REMOVE ${removeExpressions.join(', ')}`
  }

  await client.send(new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: userPk(tenant, userId),
      SK: personalEventSk(eventId)
    }),
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: marshall(expressionAttributeValues)
  }))
}

export const deletePersonalEvent = async (
  tenant: string,
  userId: string,
  eventId: string
): Promise<void> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  await client.send(new DeleteItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: userPk(tenant, userId),
      SK: personalEventSk(eventId)
    })
  }))
}

export const deletePersonalEventsByParent = async (
  tenant: string,
  userId: string,
  parentEventId: string
): Promise<void> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  // Query all personal events for the user that belong to the given parent_event_id
  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    FilterExpression: 'parent_event_id = :parentId',
    ExpressionAttributeValues: marshall({
      ':pk': userPk(tenant, userId),
      ':skPrefix': 'PERSONAL_EVENT#',
      ':parentId': parentEventId
    })
  }))

  const items = response.Items ?? []
  if (!items.length) return

  // Batch delete in chunks of 25 (BatchWriteItem limit)
  const chunks: typeof items[] = []
  for (let i = 0; i < items.length; i += 25) {
    chunks.push(items.slice(i, i + 25))
  }

  const sendBatchDelete = async (chunk: typeof items) => {
    if (!TABLE_NAME) {
      throw new Error('Missing env variable: TABLE_NAME')
    }

    let requestItems: Record<string, any> = {
      [TABLE_NAME]: chunk.map(raw => {
        const item = unmarshall(raw) as any
        return {
          DeleteRequest: {
            Key: marshall({
              PK: item.PK,
              SK: item.SK
            })
          }
        }
      })
    }

    // Retry unprocessed items with small backoff
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await client.send(new BatchWriteItemCommand({
        RequestItems: requestItems
      }))

      const unprocessed = res.UnprocessedItems
      if (unprocessed && Object.keys(unprocessed).length > 0) {
        requestItems = unprocessed
        await new Promise(resolve => setTimeout(resolve, 30))
      } else {
        break
      }
    }
  }

  await Promise.all(
    chunks.map(chunk =>
      limit(() => sendBatchDelete(chunk))
    )
  )
}

export const listEventsWithPendingReminders = async (
  tenant: string,
  nowIso: string
): Promise<PersonalEvent[]> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI4',
    KeyConditionExpression: 'PK4 = :pk AND SK4 <= :now',
    ExpressionAttributeValues: marshall({
      ':pk': `REMINDER#${tenant}`,
      ':now': nowIso
    })
  }))

  const items = response.Items?.map(item => normalizePersonalEvent(unmarshall(item))) ?? []
  return items
}

export const markReminderSent = async (
  tenant: string,
  userId: string,
  eventId: string,
  sentAtIso: string
): Promise<void> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  await client.send(new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: userPk(tenant, userId),
      SK: personalEventSk(eventId)
    }),
    UpdateExpression: 'SET reminder_sent_at = :sentAt, updated_at = :updatedAt',
    ExpressionAttributeValues: marshall({
      ':sentAt': sentAtIso,
      ':updatedAt': sentAtIso
    })
  }))
}
