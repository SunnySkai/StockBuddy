import { v4 as uuidv4 } from 'uuid'
import { BatchGetItemCommand, DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { User } from '../models/user'

const AWS_REGION = process.env.AWS_REGION
const ENV_IDENTIFIER = process.env.ENV_IDENTIFIER
const TABLE_NAME = process.env.TABLE_NAME
const DEFAULT_PROFILE_PIC_URL = `https://tixworld-raw-bucket-${ENV_IDENTIFIER}.s3.${AWS_REGION}.amazonaws.com/default/profile_pic_url.png`

export const userPk = (tenant: string, userId: string) => `TENANT#${tenant}#USER#${userId}`
const usernamePk = (tenant: string, username: string) => `TENANT#${tenant}#USERNAME#${username}`
const userEmailPk = (tenant: string, email: string) => `TENANT#${tenant}#EMAIL#${email}`
const tokenPK = (tenant: string) => `TENANT#${tenant}#BLACKLISTED_TOKEN`
const userGroupPk = (tenant: string) => `TENANT#${tenant}#USERS`

const client = new DynamoDBClient({ region: process.env.AWS_REGION })

const normalizeUser = (raw: any): User => {
  const user = raw as User & {
    username?: string | null
    is_admin?: boolean
    is_seller?: boolean
    organization_id?: string | null
    org_joined_at?: string | null
  }
  return {
    ...user,
    username: user.username ?? null,
    is_admin: !!user.is_admin,
    is_seller: !!user.is_seller,
    organization_id: user.organization_id ?? null,
    org_joined_at: user.org_joined_at ?? null
  }
}

export async function isUsernameTaken(tenant: string, username: string): Promise<boolean> {
  const res = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'PK1 = :pk and SK1 = :sk',
    ExpressionAttributeValues: marshall({
      ':pk': usernamePk(tenant, username),
      ':sk': 'PROFILE'
    })
  }))
  return !!res.Items?.length
}

export async function userHasAccount(tenant: string, email: string): Promise<boolean> {
  const res = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI2',
    KeyConditionExpression: 'PK2 = :pk and SK2 = :sk',
    ExpressionAttributeValues: marshall({
      ':pk': userEmailPk(tenant, email),
      ':sk': 'PROFILE'
    })
  }))
  return !!res.Items?.length
}

export async function createUser(
  tenant: string,
  email: string,
  username: string | null,
  passwordHash: string,
  fullName: string,
  options?: { isAdmin?: boolean; isSeller?: boolean; organizationId?: string | null; orgJoinedAt?: string | null }
): Promise<User> {
  const userId = uuidv4()
  const now = new Date().toISOString()
  const { isAdmin = false, isSeller = false, organizationId = null, orgJoinedAt = null } = options ?? {}

  const normalizedUsername = username?.toLowerCase() ?? null

  const user: User = {
    id: userId,
    email,
    username: normalizedUsername,
    password_hash: passwordHash,
    full_name: fullName,
    profile_pic_url: DEFAULT_PROFILE_PIC_URL,
    is_admin: isAdmin,
    is_seller: isSeller,
    created_at: now,
    organization_id: organizationId,
    org_joined_at: orgJoinedAt
  }

  const item: Record<string, any> = {
    PK: userPk(tenant, userId),
    SK: 'PROFILE',
    PK2: userEmailPk(tenant, email),
    SK2: 'PROFILE',
    PK3: userGroupPk(tenant),
    SK3: now,
    ...user
  }

  if (normalizedUsername) {
    item.PK1 = usernamePk(tenant, normalizedUsername)
    item.SK1 = 'PROFILE'
  }

  if (!user.organization_id) {
    delete item.organization_id
  }

  if (!user.org_joined_at) {
    delete item.org_joined_at
  }

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item)
  }))

  return user
}

export async function getUserByEmail(tenant: string, email: string): Promise<User | null> {
  const res = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI2',
    KeyConditionExpression: 'PK2 = :pk and SK2 = :sk',
    ExpressionAttributeValues: marshall({
      ':pk': userEmailPk(tenant, email),
      ':sk': 'PROFILE'
    })
  }))

  if (!res.Items?.length) {
    return null
  }

  return normalizeUser(unmarshall(res.Items[0]))
}

export async function getUserById(tenant: string, userId: string): Promise<User | null> {
  const res = await client.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({ PK: userPk(tenant, userId), SK: 'PROFILE' })
  }))

  if (!res.Item) {
    return null
  }

  return normalizeUser(unmarshall(res.Item))
}

export async function listUsers(tenant: string, options?: { limit?: number; lastKey?: any }): Promise<{ items: User[]; lastKey?: any }> {
  const res = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI3',
    KeyConditionExpression: 'PK3 = :pk',
    ExpressionAttributeValues: marshall({
      ':pk': userGroupPk(tenant)
    }),
    Limit: options?.limit,
    ExclusiveStartKey: options?.lastKey
  }))

  const items = res.Items?.map(item => normalizeUser(unmarshall(item))) ?? []
  return { items, lastKey: res.LastEvaluatedKey }
}

export async function markTokenAsBlacklisted(tenant: string, token: string): Promise<void> {
  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall({
      PK: tokenPK(tenant),
      SK: token,
      created_at: new Date().toISOString()
    })
  }))
}

export async function isTokenBlacklisted(tenant: string, token: string): Promise<boolean> {
  const res = await client.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({ PK: tokenPK(tenant), SK: token })
  }))
  return !!res.Item
}

export async function updateUserField(
  tenant: string,
  userId: string,
  key: string,
  value: any
): Promise<void> {
  const now = new Date().toISOString()

  const updateExpression = `SET #key = :value, updated_at = :ua`
  const expressionAttributeNames = { '#key': key }
  const expressionAttributeValues = marshall({
    ':value': value,
    ':ua': now
  })

  await client.send(new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({ PK: userPk(tenant, userId), SK: 'PROFILE' }),
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  }))
}

export async function batchGetUsersByIds(
  tenant: string,
  userIds: string[]
): Promise<Record<string, User>> {
  if (!userIds.length) {
    return {}
  }

  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const uniqueIds = Array.from(new Set(userIds))
  const results: Record<string, User> = {}

  const chunkSize = 100
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize)
    const command = new BatchGetItemCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: chunk.map(userId =>
            marshall({ PK: userPk(tenant, userId), SK: 'PROFILE' })
          )
        }
      }
    })

    const response = await client.send(command)
    const items = response.Responses?.[TABLE_NAME] ?? []
    items.forEach(item => {
      const user = normalizeUser(unmarshall(item))
      results[user.id] = user
    })
  }

  return results
}
