import { v4 as uuidv4 } from 'uuid'
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { Member, MemberCreateInput, MemberStatus, MemberUpdateInput } from '../models/member'
import { organizationPk } from './organization'
import { createVendor, findVendorByName } from './vendors'
import { createTransaction as createTransactionRecord } from './transactions'

const TABLE_NAME = process.env.TABLE_NAME
const client = new DynamoDBClient({ region: process.env.AWS_REGION })
const DEFAULT_MEMBER_STATUS: MemberStatus = 'ACTIVE'

const memberSk = (memberId: string) => `MEMBER#${memberId}`

const normalizeString = (value: unknown, allowEmpty = false): string | null => {
  if (value === null || value === undefined) {
    return null
  }
  const normalized = String(value).trim()
  if (!normalized.length && !allowEmpty) {
    return null
  }
  return normalized
}

const parseMemberStatus = (value: unknown): MemberStatus | null => {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim().toUpperCase()
  if (normalized === 'ACTIVE') {
    return 'ACTIVE'
  }
  if (normalized === 'BANNED' || normalized === 'CLOSED') {
    return 'BANNED'
  }
  return null
}

const resolveMemberStatus = (value: unknown, fallback: MemberStatus = DEFAULT_MEMBER_STATUS): MemberStatus => {
  return parseMemberStatus(value) ?? fallback
}

const normalizeMember = (raw: any): Member => {
  const payload = raw as Member

  return {
    id: payload.id,
    organization_id: payload.organization_id,
    name: payload.name,
    email: payload.email,
    status: resolveMemberStatus(payload.status),
    group_label: normalizeString(payload.group_label, true),
    team_id: normalizeString(payload.team_id, true),
    team_name: normalizeString(payload.team_name, true),
    team_logo: normalizeString(payload.team_logo, true),
    account_password: normalizeString(payload.account_password, true),
    account_number: normalizeString(payload.account_number, true),
    phone_number: normalizeString(payload.phone_number, true),
    date_of_birth: normalizeString(payload.date_of_birth, true),
    membership_type: normalizeString(payload.membership_type, true),
    member_age_type: normalizeString(payload.member_age_type, true),
    address: normalizeString(payload.address, true),
    post_code: normalizeString(payload.post_code, true),
    account_age: normalizeString(payload.account_age, true),
    membership_price: normalizeString(payload.membership_price, true),
    vendor_id: normalizeString(payload.vendor_id, true),
    vendor_name: normalizeString(payload.vendor_name, true),
    bank: normalizeString(payload.bank, true),
    created_at: payload.created_at,
    updated_at: payload.updated_at
  }
}

const parseMembershipAmount = (value: string | null): number | null => {
  if (!value) {
    return null
  }
  const stripped = value.replace(/,/g, '').replace(/[^\d.-]/g, '').trim()
  if (!stripped.length) {
    return null
  }
  const parsed = Number(stripped)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

const createMembershipTransaction = async (tenant: string, organizationId: string, member: Member): Promise<void> => {
  const amount = parseMembershipAmount(member.membership_price)
  if (!amount || !member.vendor_id) {
    return
  }
  const details = [member.name, member.team_name].filter((value): value is string => Boolean(value))
  const notes = details.length ? `Membership for ${details.join(' - ')}` : null
  await createTransactionRecord(tenant, organizationId, {
    type: 'membership',
    vendorId: member.vendor_id,
    amount,
    category: 'membership',
    notes
  })
}

const buildMemberItem = (
  tenant: string,
  organizationId: string,
  member: Member,
  timestamps?: { createdAt?: string; updatedAt?: string }
) => {
  const createdAt = timestamps?.createdAt ?? member.created_at ?? new Date().toISOString()
  const updatedAt = timestamps?.updatedAt ?? member.updated_at ?? createdAt

  return {
    PK: organizationPk(tenant, organizationId),
    SK: memberSk(member.id),
    entity_type: 'ORGANIZATION_MEMBER',
    tenant,
    organization_id: organizationId,
    id: member.id,
    name: member.name,
    email: member.email,
    group_label: member.group_label,
    team_id: member.team_id,
    team_name: member.team_name,
    team_logo: member.team_logo,
    status: member.status,
    account_password: member.account_password,
    account_number: member.account_number,
    phone_number: member.phone_number,
    date_of_birth: member.date_of_birth,
    membership_type: member.membership_type,
    member_age_type: member.member_age_type,
    address: member.address,
    post_code: member.post_code,
    account_age: member.account_age,
    membership_price: member.membership_price,
    vendor_id: member.vendor_id,
    vendor_name: member.vendor_name,
    bank: member.bank,
    created_at: createdAt,
    updated_at: updatedAt
  }
}

const searchCandidates = (member: Member): string[] => {
  return [
    member.name,
    member.email,
    member.account_number ?? '',
    member.membership_type ?? '',
    member.member_age_type ?? '',
    member.address ?? '',
    member.post_code ?? '',
    member.phone_number ?? '',
    member.account_age ?? '',
    member.membership_price ?? '',
    member.vendor_name ?? '',
    member.bank ?? '',
    member.group_label ?? '',
    member.team_name ?? '',
    member.status
  ]
}

type ListMembersOptions = {
  search?: string
  teamNames?: string[]
  teamIds?: string[]
  statuses?: MemberStatus[]
}

export const listMembers = async (
  tenant: string,
  organizationId: string,
  options?: ListMembersOptions
): Promise<Member[]> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: marshall({
      ':pk': organizationPk(tenant, organizationId),
      ':skPrefix': 'MEMBER#'
    })
  }))

  let items = response.Items?.map((item) => normalizeMember(unmarshall(item))) ?? []
  items = items.sort((a, b) => b.created_at.localeCompare(a.created_at))

  const searchTerm = options?.search?.trim().toLowerCase()
  if (searchTerm) {
    items = items.filter((member) =>
      searchCandidates(member).some((candidate) => (candidate ?? '').toLowerCase().includes(searchTerm))
    )
  }

  const normalizedTeams =
    options?.teamNames
      ?.map((name) => normalizeString(name, true)?.toLowerCase())
      .filter((name): name is string => Boolean(name)) ?? []
  if (normalizedTeams.length > 0) {
    items = items.filter((member) => {
      const candidate = normalizeString(member.team_name, true)?.toLowerCase()
      if (!candidate) {
        return false
      }
      return normalizedTeams.includes(candidate)
    })
  }

  const normalizedTeamIds =
    options?.teamIds
      ?.map((id) => normalizeString(id, true)?.toLowerCase())
      .filter((id): id is string => Boolean(id)) ?? []
  if (normalizedTeamIds.length > 0) {
    items = items.filter((member) => {
      const candidate = normalizeString(member.team_id, true)?.toLowerCase()
      if (!candidate) {
        return false
      }
      return normalizedTeamIds.includes(candidate)
    })
  }

  const normalizedStatuses =
    options?.statuses
      ?.map((status) => status?.toUpperCase() as MemberStatus)
      .filter((status): status is MemberStatus => status === 'ACTIVE' || status === 'BANNED') ?? []
  if (normalizedStatuses.length > 0) {
    items = items.filter((member) => normalizedStatuses.includes(member.status))
  }

  return items
}

export const listMembersByVendor = async (
  tenant: string,
  organizationId: string,
  vendorId: string
): Promise<Member[]> => {
  const members = await listMembers(tenant, organizationId)
  return members.filter(member => member.vendor_id === vendorId)
}

const fetchMembersForGroup = async (
  tenant: string,
  organizationId: string,
  groupLabel: string
): Promise<Member[]> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const normalizedLabel = normalizeString(groupLabel, true)
  if (!normalizedLabel) {
    return []
  }

  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    FilterExpression: '#group_label = :groupLabel',
    ExpressionAttributeNames: {
      '#group_label': 'group_label'
    },
    ExpressionAttributeValues: marshall({
      ':pk': organizationPk(tenant, organizationId),
      ':skPrefix': 'MEMBER#',
      ':groupLabel': normalizedLabel
    })
  }))

  return response.Items?.map(item => normalizeMember(unmarshall(item))) ?? []
}

const ensureGroupTeamConsistency = async (
  tenant: string,
  organizationId: string,
  groupLabel: string | null,
  teamId: string | null,
  options?: { ignoreMemberId?: string }
): Promise<void> => {
  if (!groupLabel) {
    return
  }
  const normalizedLabel = normalizeString(groupLabel, true)
  if (!normalizedLabel) {
    return
  }
  if (!teamId) {
    throw new Error('Team selection is required.')
  }

  const peers = await fetchMembersForGroup(tenant, organizationId, normalizedLabel)
  const conflict = peers.find(member => member.id !== options?.ignoreMemberId && member.team_id && member.team_id !== teamId)
  if (conflict) {
    const conflictTeam = conflict.team_name ?? 'another team'
    throw new Error(`Group "${normalizedLabel}" is already associated with ${conflictTeam}. All members must share the same team.`)
  }
}

const resolveTeamVendor = async (
  tenant: string,
  organizationId: string,
  teamName: string | null
): Promise<{ vendor_id: string; vendor_name: string }> => {
  const normalizedName = normalizeString(teamName, true)
  if (!normalizedName) {
    throw new Error('Team selection is required.')
  }

  const existing = await findVendorByName(tenant, organizationId, normalizedName)
  if (existing) {
    return { vendor_id: existing.id, vendor_name: existing.name }
  }

  const created = await createVendor(tenant, organizationId, { name: normalizedName })
  return { vendor_id: created.id, vendor_name: created.name }
}

export const getMemberById = async (
  tenant: string,
  organizationId: string,
  memberId: string
): Promise<Member | null> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const result = await client.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: memberSk(memberId)
    })
  }))

  if (!result.Item) {
    return null
  }
  return normalizeMember(unmarshall(result.Item))
}

const buildMemberFromInput = (
  organizationId: string,
  input: MemberCreateInput,
  overrides?: Partial<Member>
): Member => {
  return {
    id: overrides?.id ?? uuidv4(),
    organization_id: organizationId,
    name: normalizeString(input.name, true) ?? '',
    email: normalizeString(input.email, true) ?? '',
    group_label: normalizeString(input.group_label, true),
    team_id: normalizeString(input.team_id, true),
    team_name: normalizeString(input.team_name, true),
    team_logo: normalizeString(input.team_logo, true),
    account_password: normalizeString(input.account_password, true),
    account_number: normalizeString(input.account_number, true),
    phone_number: normalizeString(input.phone_number, true),
    date_of_birth: normalizeString(input.date_of_birth, true),
    membership_type: normalizeString(input.membership_type, true),
    member_age_type: normalizeString(input.member_age_type, true),
    address: normalizeString(input.address, true),
    post_code: normalizeString(input.post_code, true),
    account_age: normalizeString(input.account_age, true),
    membership_price: normalizeString(input.membership_price, true),
    vendor_id: normalizeString(input.vendor_id, true),
    vendor_name: normalizeString(input.vendor_name, true),
    bank: normalizeString(input.bank, true),
    status: resolveMemberStatus(input.status, DEFAULT_MEMBER_STATUS),
    created_at: overrides?.created_at ?? new Date().toISOString(),
    updated_at: overrides?.updated_at ?? new Date().toISOString()
  }
}

export const createMember = async (
  tenant: string,
  organizationId: string,
  input: MemberCreateInput
): Promise<Member> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const member = buildMemberFromInput(organizationId, input)
  if (!member.name || !member.email) {
    throw new Error('name and email are required.')
  }
  if (!member.team_id || !member.team_name) {
    throw new Error('Team selection is required.')
  }
  if (!member.membership_price) {
    throw new Error('membership_price is required.')
  }
  const vendor = await resolveTeamVendor(tenant, organizationId, member.team_name)
  member.vendor_id = vendor.vendor_id
  member.vendor_name = vendor.vendor_name

  await ensureGroupTeamConsistency(tenant, organizationId, member.group_label, member.team_id)

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(buildMemberItem(tenant, organizationId, member))
  }))
  await createMembershipTransaction(tenant, organizationId, member)

  return member
}

export const updateMember = async (
  tenant: string,
  organizationId: string,
  memberId: string,
  updates: MemberUpdateInput
): Promise<Member | null> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const existing = await getMemberById(tenant, organizationId, memberId)
  if (!existing) {
    return null
  }

  const next: Member = {
    ...existing,
    updated_at: new Date().toISOString()
  }

  const assignOptionalField = (field: keyof MemberCreateInput) => {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) {
      return
    }
    const normalized = normalizeString((updates as any)[field], true)
    ;(next as any)[field] = normalized
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    const normalized = normalizeString(updates.name, true)
    if (!normalized) {
      throw new Error('name cannot be empty.')
    }
    next.name = normalized
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
    const normalized = normalizeString(updates.email, true)
    if (!normalized) {
      throw new Error('email cannot be empty.')
    }
    next.email = normalized
  }

  assignOptionalField('account_password')
  assignOptionalField('account_number')
  assignOptionalField('phone_number')
  assignOptionalField('date_of_birth')
  assignOptionalField('membership_type')
  assignOptionalField('member_age_type')
  assignOptionalField('address')
  assignOptionalField('post_code')
  assignOptionalField('account_age')
  assignOptionalField('membership_price')
  assignOptionalField('bank')
  assignOptionalField('group_label')
  assignOptionalField('team_id')
  assignOptionalField('team_name')
  assignOptionalField('team_logo')

  if (
    Object.prototype.hasOwnProperty.call(updates, 'team_id') ||
    Object.prototype.hasOwnProperty.call(updates, 'team_name')
  ) {
    if (!next.team_id || !next.team_name) {
      throw new Error('Team selection is required.')
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
    if (!updates.status) {
      throw new Error('status must be ACTIVE or BANNED.')
    }
    next.status = updates.status
  }

  if (!next.name || !next.email) {
    throw new Error('name and email are required.')
  }
  if (!next.membership_price) {
    throw new Error('membership_price is required.')
  }

  const teamChanged = next.team_id !== existing.team_id || next.team_name !== existing.team_name
  const normalizedTeamName = (next.team_name ?? '').trim().toLowerCase()
  const normalizedVendorName = (next.vendor_name ?? '').trim().toLowerCase()
  const vendorMismatch = normalizedTeamName.length > 0 && normalizedVendorName !== normalizedTeamName
  if (!next.vendor_id || !next.vendor_name || teamChanged || vendorMismatch) {
    const vendor = await resolveTeamVendor(tenant, organizationId, next.team_name)
    next.vendor_id = vendor.vendor_id
    next.vendor_name = vendor.vendor_name
  }

  await ensureGroupTeamConsistency(tenant, organizationId, next.group_label, next.team_id, {
    ignoreMemberId: next.id
  })

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(buildMemberItem(tenant, organizationId, next, {
      createdAt: existing.created_at,
      updatedAt: next.updated_at
    }))
  }))

  return next
}

export const deleteMember = async (
  tenant: string,
  organizationId: string,
  memberId: string
): Promise<void> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  await client.send(new DeleteItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: memberSk(memberId)
    })
  }))
}
