import { randomBytes } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { Organization, OrganizationMember, OrganizationMemberRole } from '../models/organization'
import { OrganizationInvitation, OrganizationInvitationStatus } from '../models/organization_invitation'
import { userPk } from './user'

const TABLE_NAME = process.env.TABLE_NAME
const client = new DynamoDBClient({ region: process.env.AWS_REGION })

const organizationPk = (tenant: string, orgId: string) => `TENANT#${tenant}#ORG#${orgId}`
const organizationCollectionPk = (tenant: string) => `TENANT#${tenant}#ORGS`
const organizationMemberSk = (userId: string) => `MEMBER#${userId}`
const organizationInvitationPk = (tenant: string, code: string) => `TENANT#${tenant}#INVITE#${code}`
const organizationInvitationEmailPk = (tenant: string, email: string) => `TENANT#${tenant}#INVITE_EMAIL#${email}`
const organizationInvitationOrgPk = (tenant: string, orgId: string) => `TENANT#${tenant}#ORG#${orgId}#INVITES`

const normalizeOrganization = (raw: any): Organization => {
  const organization = raw as Organization & { owner_user_id?: string }
  return {
    id: organization.id,
    name: organization.name,
    owner_user_id: organization.owner_user_id,
    created_at: organization.created_at,
    updated_at: organization.updated_at
  }
}

const normalizeInvitation = (raw: any): OrganizationInvitation => {
  const invitation = raw as OrganizationInvitation & {
    invited_by_user_id?: string | null
    accepted_at?: string | null
    accepted_by_user_id?: string | null
    cancelled_at?: string | null
    cancelled_by_user_id?: string | null
    expires_at?: string | null
  }
  return {
    code: invitation.code,
    org_id: invitation.org_id,
    email: invitation.email,
    invited_by_user_id: invitation.invited_by_user_id ?? null,
    status: invitation.status,
    created_at: invitation.created_at,
    updated_at: invitation.updated_at,
    expires_at: invitation.expires_at ?? null,
    accepted_at: invitation.accepted_at ?? null,
    accepted_by_user_id: invitation.accepted_by_user_id ?? null,
    cancelled_at: invitation.cancelled_at ?? null,
    cancelled_by_user_id: invitation.cancelled_by_user_id ?? null
  }
}

const normalizeMember = (raw: any): OrganizationMember => {
  const member = raw as OrganizationMember & {
    invited_by_user_id?: string | null
  }
  return {
    org_id: member.org_id,
    user_id: member.user_id,
    role: member.role,
    invited_by_user_id: member.invited_by_user_id ?? null,
    created_at: member.created_at,
    joined_at: member.joined_at
  }
}

export async function createOrganization(
  tenant: string,
  params: { name: string; ownerUserId: string }
): Promise<Organization> {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const trimmedName = params.name.trim()
  if (!trimmedName.length) {
    throw new Error('Organization name is required')
  }

  const organizationId = uuidv4()
  const now = new Date().toISOString()

  const organization: Organization = {
    id: organizationId,
    name: trimmedName,
    owner_user_id: params.ownerUserId,
    created_at: now,
    updated_at: now
  }

  const transact = new TransactWriteItemsCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: marshall({
            PK: organizationPk(tenant, organizationId),
            SK: 'PROFILE',
            PK3: organizationCollectionPk(tenant),
            SK3: now,
            entity_type: 'ORGANIZATION',
            ...organization
          }),
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
        }
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: marshall({ PK: userPk(tenant, params.ownerUserId), SK: 'PROFILE' }),
          UpdateExpression: 'SET organization_id = :orgId, org_joined_at = :joinedAt, updated_at = :ua',
          ConditionExpression: 'attribute_exists(id) AND attribute_not_exists(organization_id)',
          ExpressionAttributeValues: marshall({
            ':orgId': organizationId,
            ':joinedAt': now,
            ':ua': now
          })
        }
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: marshall({
            PK: organizationPk(tenant, organizationId),
            SK: organizationMemberSk(params.ownerUserId),
            org_id: organizationId,
            user_id: params.ownerUserId,
            role: OrganizationMemberRole.OWNER,
            invited_by_user_id: null,
            created_at: now,
            joined_at: now,
            entity_type: 'ORGANIZATION_MEMBER'
          }),
          ConditionExpression: 'attribute_not_exists(user_id)'
        }
      }
    ]
  })

  await client.send(transact)

  return organization
}

export async function getOrganizationById(tenant: string, orgId: string): Promise<Organization | null> {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const response = await client.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({ PK: organizationPk(tenant, orgId), SK: 'PROFILE' })
  }))

  if (!response.Item) {
    return null
  }

  return normalizeOrganization(unmarshall(response.Item))
}

export async function addUserToOrganization(
  tenant: string,
  orgId: string,
  userId: string,
  options?: { role?: OrganizationMemberRole; invitedByUserId?: string | null }
): Promise<void> {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const now = new Date().toISOString()

  const transact = new TransactWriteItemsCommand({
    TransactItems: [
      {
        ConditionCheck: {
          TableName: TABLE_NAME,
          Key: marshall({ PK: organizationPk(tenant, orgId), SK: 'PROFILE' }),
          ConditionExpression: 'attribute_exists(PK)'
        }
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: marshall({ PK: userPk(tenant, userId), SK: 'PROFILE' }),
          UpdateExpression: 'SET organization_id = :orgId, org_joined_at = :joinedAt, updated_at = :ua',
          ConditionExpression: 'attribute_exists(id) AND attribute_not_exists(organization_id)',
          ExpressionAttributeValues: marshall({
            ':orgId': orgId,
            ':joinedAt': now,
            ':ua': now
          })
        }
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: marshall({
            PK: organizationPk(tenant, orgId),
            SK: organizationMemberSk(userId),
            org_id: orgId,
            user_id: userId,
            role: options?.role ?? OrganizationMemberRole.MEMBER,
            invited_by_user_id: options?.invitedByUserId ?? null,
            created_at: now,
            joined_at: now,
            entity_type: 'ORGANIZATION_MEMBER'
          }),
          ConditionExpression: 'attribute_not_exists(user_id)'
        }
      }
    ]
  })

  await client.send(transact)
}

export async function listOrganizationMembers(
  tenant: string,
  orgId: string
): Promise<OrganizationMember[]> {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: marshall({
      ':pk': organizationPk(tenant, orgId),
      ':skPrefix': 'MEMBER#'
    })
  }))

  const items = response.Items ?? []
  return items.map(item => normalizeMember(unmarshall(item)))
}

export async function createOrganizationInvitation(
  tenant: string,
  params: { orgId: string; email: string; invitedByUserId: string | null; ttlHours?: number }
): Promise<OrganizationInvitation> {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const code = randomBytes(32).toString('hex')
  const now = new Date()
  const createdAt = now.toISOString()
  const ttlHours = params.ttlHours && params.ttlHours > 0 ? params.ttlHours : 24 * 7
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString()
  const normalizedEmail = params.email.toLowerCase()

  const invitation: OrganizationInvitation = {
    code,
    org_id: params.orgId,
    email: normalizedEmail,
    invited_by_user_id: params.invitedByUserId,
    status: OrganizationInvitationStatus.PENDING,
    created_at: createdAt,
    updated_at: createdAt,
    expires_at: expiresAt,
    accepted_at: null,
    accepted_by_user_id: null,
    cancelled_at: null,
    cancelled_by_user_id: null
  }

  const item = {
    PK: organizationInvitationPk(tenant, code),
    SK: 'PROFILE',
    PK2: organizationInvitationEmailPk(tenant, normalizedEmail),
    SK2: code,
    PK3: organizationInvitationOrgPk(tenant, params.orgId),
    SK3: createdAt,
    entity_type: 'ORGANIZATION_INVITATION',
    ...invitation
  }

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item),
    ConditionExpression: 'attribute_not_exists(code)'
  }))

  return invitation
}

export async function getInvitationByCode(
  tenant: string,
  code: string
): Promise<OrganizationInvitation | null> {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const response = await client.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: organizationInvitationPk(tenant, code),
      SK: 'PROFILE'
    })
  }))

  if (!response.Item) {
    return null
  }

  return normalizeInvitation(unmarshall(response.Item))
}

export async function listOrganizationInvitations(
  tenant: string,
  orgId: string
): Promise<OrganizationInvitation[]> {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI3',
    KeyConditionExpression: 'PK3 = :pk',
    ExpressionAttributeValues: marshall({
      ':pk': organizationInvitationOrgPk(tenant, orgId)
    })
  }))

  const items = response.Items ?? []
  return items.map(item => normalizeInvitation(unmarshall(item)))
}

export async function findActiveInvitationByEmail(
  tenant: string,
  orgId: string,
  email: string
): Promise<OrganizationInvitation | null> {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI2',
    KeyConditionExpression: 'PK2 = :pk',
    ExpressionAttributeValues: marshall({
      ':pk': organizationInvitationEmailPk(tenant, email.toLowerCase())
    })
  }))

  const items = response.Items ?? []
  const invitations = items
    .map(item => normalizeInvitation(unmarshall(item)))
    .filter(invite =>
      invite.org_id === orgId &&
      invite.status === OrganizationInvitationStatus.PENDING &&
      (!invite.expires_at || new Date(invite.expires_at) > new Date())
    )

  invitations.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

  return invitations.length ? invitations[0] : null
}

export async function markInvitationAccepted(
  tenant: string,
  code: string,
  acceptedByUserId: string
): Promise<void> {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const now = new Date().toISOString()

  await client.send(new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: organizationInvitationPk(tenant, code),
      SK: 'PROFILE'
    }),
    UpdateExpression: 'SET #status = :accepted, accepted_at = :acceptedAt, accepted_by_user_id = :acceptedBy, updated_at = :ua',
    ConditionExpression: '#status = :pending',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: marshall({
      ':pending': OrganizationInvitationStatus.PENDING,
      ':accepted': OrganizationInvitationStatus.ACCEPTED,
      ':acceptedAt': now,
      ':acceptedBy': acceptedByUserId,
      ':ua': now
    })
  }))
}

export async function markInvitationCancelled(
  tenant: string,
  code: string,
  cancelledByUserId: string
): Promise<void> {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const now = new Date().toISOString()

  await client.send(new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: organizationInvitationPk(tenant, code),
      SK: 'PROFILE'
    }),
    UpdateExpression: 'SET #status = :cancelled, cancelled_at = :cancelledAt, cancelled_by_user_id = :cancelledBy, updated_at = :ua',
    ConditionExpression: '#status = :pending',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: marshall({
      ':pending': OrganizationInvitationStatus.PENDING,
      ':cancelled': OrganizationInvitationStatus.CANCELLED,
      ':cancelledAt': now,
      ':cancelledBy': cancelledByUserId,
      ':ua': now
    })
  }))
}

export function isConditionalCheckFailed(error: unknown): boolean {
  return error instanceof ConditionalCheckFailedException || (error as any)?.name === 'ConditionalCheckFailedException'
}

export {
  organizationPk,
  organizationMemberSk,
  organizationInvitationPk,
  organizationInvitationEmailPk,
  organizationInvitationOrgPk
}
