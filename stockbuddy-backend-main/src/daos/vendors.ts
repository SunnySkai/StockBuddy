import { v4 as uuidv4 } from 'uuid'
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { Vendor, VendorCreateInput, VendorUpdateInput } from '../models/vendor'
import { organizationPk } from './organization'
import { nextDisplayId } from './counters'

const TABLE_NAME = process.env.TABLE_NAME
const client = new DynamoDBClient({ region: process.env.AWS_REGION })

const vendorSk = (vendorId: string) => `VENDOR#${vendorId}`

const normalizeNumber = (value: unknown): number => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }
  return 0
}

const normalizeString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).trim()
}

const normalizeVendor = (raw: any): Vendor => {
  const vendor = raw as Vendor & { balance?: number }
  return {
    id: vendor.id,
    organization_id: vendor.organization_id,
    display_id: typeof vendor.display_id === 'number' ? vendor.display_id : null,
    name: normalizeString(vendor.name),
    balance: typeof vendor.balance === 'number' ? vendor.balance : 0,
    created_at: vendor.created_at,
    updated_at: vendor.updated_at
  }
}

const buildVendorItem = (
  tenant: string,
  organizationId: string,
  vendor: Vendor,
  timestamps?: { createdAt?: string; updatedAt?: string }
) => {
  const createdAt = timestamps?.createdAt ?? vendor.created_at ?? new Date().toISOString()
  const updatedAt = timestamps?.updatedAt ?? vendor.updated_at ?? createdAt

  return {
    PK: organizationPk(tenant, organizationId),
    SK: vendorSk(vendor.id),
    entity_type: 'ORGANIZATION_VENDOR',
    tenant,
    organization_id: organizationId,
    display_id: vendor.display_id,
    id: vendor.id,
    name: vendor.name,
    balance: vendor.balance,
    created_at: createdAt,
    updated_at: updatedAt
  }
}

export const listVendors = async (
  tenant: string,
  organizationId: string,
  options?: { search?: string }
): Promise<Vendor[]> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: marshall({
      ':pk': organizationPk(tenant, organizationId),
      ':skPrefix': 'VENDOR#'
    })
  }))

  let items = response.Items?.map((item) => normalizeVendor(unmarshall(item))) ?? []
  items = items.sort((a, b) => b.created_at.localeCompare(a.created_at))

  const searchTerm = options?.search?.trim().toLowerCase()
  if (searchTerm) {
    items = items.filter((vendor) => vendor.name.toLowerCase().includes(searchTerm))
  }

  return items
}

export const getVendorById = async (
  tenant: string,
  organizationId: string,
  vendorId: string
): Promise<Vendor | null> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const result = await client.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: vendorSk(vendorId)
    })
  }))

  if (!result.Item) {
    return null
  }
  return normalizeVendor(unmarshall(result.Item))
}

const buildVendorFromInput = (
  organizationId: string,
  input: VendorCreateInput,
  overrides?: Partial<Vendor>
): Vendor => {
  const balance = normalizeNumber(input.balance ?? overrides?.balance ?? 0)
  return {
    id: overrides?.id ?? uuidv4(),
    organization_id: organizationId,
    display_id: overrides?.display_id ?? null,
    name: normalizeString(input.name),
    balance,
    created_at: overrides?.created_at ?? new Date().toISOString(),
    updated_at: overrides?.updated_at ?? new Date().toISOString()
  }
}

export const createVendor = async (
  tenant: string,
  organizationId: string,
  input: VendorCreateInput
): Promise<Vendor> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const displayId = await nextDisplayId(tenant, organizationId, 'VENDOR')
  const vendor = buildVendorFromInput(organizationId, input, { display_id: displayId })
  if (!vendor.name) {
    throw new Error('Vendor name is required.')
  }

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(buildVendorItem(tenant, organizationId, vendor))
  }))

  return vendor
}

export const updateVendor = async (
  tenant: string,
  organizationId: string,
  vendorId: string,
  updates: VendorUpdateInput
): Promise<Vendor | null> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const existing = await getVendorById(tenant, organizationId, vendorId)
  if (!existing) {
    return null
  }

  const next: Vendor = {
    ...existing,
    updated_at: new Date().toISOString()
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    const normalized = normalizeString(updates.name)
    if (!normalized) {
      throw new Error('Vendor name is required.')
    }
    next.name = normalized
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'balance')) {
    next.balance = normalizeNumber(updates.balance)
  }

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(buildVendorItem(tenant, organizationId, next, {
      createdAt: existing.created_at,
      updatedAt: next.updated_at
    }))
  }))

  return next
}

export const deleteVendor = async (
  tenant: string,
  organizationId: string,
  vendorId: string
): Promise<void> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  await client.send(new DeleteItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: vendorSk(vendorId)
    })
  }))
}

const comparableName = (value: string): string => value.trim().toLowerCase()

export const findVendorByName = async (
  tenant: string,
  organizationId: string,
  name: string | null
): Promise<Vendor | null> => {
  if (!name) {
    return null
  }
  const normalized = comparableName(name)
  if (!normalized.length) {
    return null
  }
  const vendors = await listVendors(tenant, organizationId)
  return vendors.find(vendor => comparableName(vendor.name) === normalized) ?? null
}

export const adjustVendorBalance = async (
  tenant: string,
  organizationId: string,
  vendorId: string,
  delta: number
): Promise<void> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }
  if (!Number.isFinite(delta) || delta === 0) {
    return
  }
  const now = new Date().toISOString()
  await client.send(new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: vendorSk(vendorId)
    }),
    UpdateExpression: 'SET updated_at = :ua ADD balance :delta',
    ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
    ExpressionAttributeValues: marshall({
      ':ua': now,
      ':delta': delta
    })
  }))
}
