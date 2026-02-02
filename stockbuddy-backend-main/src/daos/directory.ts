import { v4 as uuidv4 } from 'uuid'
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import {
  DirectoryCounterparty,
  DirectoryCounterpartyCreateInput,
  DirectoryCounterpartyUpdateInput,
  DirectoryCustomer,
  DirectoryCustomerCreateInput,
  DirectoryCustomerUpdateInput
} from '../models/directory'
import { organizationPk } from './organization'
import { nextDisplayId } from './counters'

const TABLE_NAME = process.env.TABLE_NAME
const client = new DynamoDBClient({ region: process.env.AWS_REGION })

const customerSk = (id: string) => `DIRECTORY#CUSTOMER#${id}`
const counterpartySk = (id: string) => `DIRECTORY#COUNTERPARTY#${id}`

const formatDisplayId = (prefix: string, sequence: number) =>
  `${prefix}-${String(sequence).padStart(3, '0')}`

const normalizeString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).trim()
}

const normalizeOptionalString = (value: unknown): string | null => {
  const normalized = normalizeString(value)
  return normalized.length ? normalized : null
}

const normalizeCustomerRecord = (raw: any): DirectoryCustomer => {
  const record = raw as DirectoryCustomer
  return {
    id: record.id,
    organization_id: record.organization_id,
    display_id: record.display_id,
    name: normalizeString(record.name),
    number: normalizeString(record.number),
    email: normalizeOptionalString(record.email),
    notes: normalizeOptionalString(record.notes),
    created_at: record.created_at,
    updated_at: record.updated_at
  }
}

const normalizeCounterpartyRecord = (raw: any): DirectoryCounterparty => {
  const record = raw as DirectoryCounterparty
  return {
    id: record.id,
    organization_id: record.organization_id,
    display_id: record.display_id,
    name: normalizeString(record.name),
    phone: normalizeString(record.phone),
    role: normalizeOptionalString(record.role),
    email: normalizeOptionalString(record.email),
    context: normalizeOptionalString(record.context),
    vendor_id: normalizeOptionalString(record.vendor_id),
    vendor_name: normalizeOptionalString(record.vendor_name),
    created_at: record.created_at,
    updated_at: record.updated_at
  }
}

const buildCustomerItem = (
  tenant: string,
  organizationId: string,
  record: DirectoryCustomer,
  timestamps?: { createdAt?: string; updatedAt?: string }
) => {
  const createdAt = timestamps?.createdAt ?? record.created_at ?? new Date().toISOString()
  const updatedAt = timestamps?.updatedAt ?? record.updated_at ?? createdAt

  return {
    PK: organizationPk(tenant, organizationId),
    SK: customerSk(record.id),
    entity_type: 'DIRECTORY_CUSTOMER',
    tenant,
    organization_id: organizationId,
    id: record.id,
    display_id: record.display_id,
    name: record.name,
    number: record.number,
    email: record.email,
    notes: record.notes,
    created_at: createdAt,
    updated_at: updatedAt
  }
}

const buildCounterpartyItem = (
  tenant: string,
  organizationId: string,
  record: DirectoryCounterparty,
  timestamps?: { createdAt?: string; updatedAt?: string }
) => {
  const createdAt = timestamps?.createdAt ?? record.created_at ?? new Date().toISOString()
  const updatedAt = timestamps?.updatedAt ?? record.updated_at ?? createdAt

  return {
    PK: organizationPk(tenant, organizationId),
    SK: counterpartySk(record.id),
    entity_type: 'DIRECTORY_COUNTERPARTY',
    tenant,
    organization_id: organizationId,
    id: record.id,
    display_id: record.display_id,
    name: record.name,
    phone: record.phone,
    role: record.role,
    email: record.email,
    context: record.context,
    vendor_id: record.vendor_id,
    vendor_name: record.vendor_name,
    created_at: createdAt,
    updated_at: updatedAt
  }
}

const ensureTableName = (): string => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }
  return TABLE_NAME
}

export const listDirectoryCustomers = async (
  tenant: string,
  organizationId: string
): Promise<DirectoryCustomer[]> => {
  const tableName = ensureTableName()
  const response = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: marshall({
      ':pk': organizationPk(tenant, organizationId),
      ':sk': 'DIRECTORY#CUSTOMER#'
    })
  }))

  const items = response.Items?.map(item => normalizeCustomerRecord(unmarshall(item))) ?? []
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export const listDirectoryCounterparties = async (
  tenant: string,
  organizationId: string
): Promise<DirectoryCounterparty[]> => {
  const tableName = ensureTableName()
  const response = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: marshall({
      ':pk': organizationPk(tenant, organizationId),
      ':sk': 'DIRECTORY#COUNTERPARTY#'
    })
  }))

  const items = response.Items?.map(item => normalizeCounterpartyRecord(unmarshall(item))) ?? []
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export const getDirectoryCustomerById = async (
  tenant: string,
  organizationId: string,
  customerId: string
): Promise<DirectoryCustomer | null> => {
  const tableName = ensureTableName()
  const response = await client.send(new GetItemCommand({
    TableName: tableName,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: customerSk(customerId)
    })
  }))

  if (!response.Item) {
    return null
  }
  return normalizeCustomerRecord(unmarshall(response.Item))
}

export const getDirectoryCounterpartyById = async (
  tenant: string,
  organizationId: string,
  counterpartyId: string
): Promise<DirectoryCounterparty | null> => {
  const tableName = ensureTableName()
  const response = await client.send(new GetItemCommand({
    TableName: tableName,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: counterpartySk(counterpartyId)
    })
  }))

  if (!response.Item) {
    return null
  }
  return normalizeCounterpartyRecord(unmarshall(response.Item))
}

export const createDirectoryCustomer = async (
  tenant: string,
  organizationId: string,
  input: DirectoryCustomerCreateInput
): Promise<DirectoryCustomer> => {
  const tableName = ensureTableName()
  const now = new Date().toISOString()
  const sequence = await nextDisplayId(tenant, organizationId, 'DIRECTORY_CUSTOMER')
  const record: DirectoryCustomer = {
    id: uuidv4(),
    organization_id: organizationId,
    display_id: formatDisplayId('CN', sequence),
    name: normalizeString(input.name),
    number: normalizeString(input.number),
    email: normalizeOptionalString(input.email),
    notes: normalizeOptionalString(input.notes),
    created_at: now,
    updated_at: now
  }

  await client.send(new PutItemCommand({
    TableName: tableName,
    Item: marshall(buildCustomerItem(tenant, organizationId, record))
  }))

  return record
}

export const updateDirectoryCustomer = async (
  tenant: string,
  organizationId: string,
  customerId: string,
  updates: DirectoryCustomerUpdateInput
): Promise<DirectoryCustomer | null> => {
  const tableName = ensureTableName()
  const existing = await getDirectoryCustomerById(tenant, organizationId, customerId)
  if (!existing) {
    return null
  }

  const next: DirectoryCustomer = {
    ...existing,
    updated_at: new Date().toISOString()
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    const normalized = normalizeString(updates.name)
    if (!normalized) {
      throw new Error('Name is required.')
    }
    next.name = normalized
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'number')) {
    const normalized = normalizeString(updates.number)
    if (!normalized) {
      throw new Error('Number is required.')
    }
    next.number = normalized
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
    next.email = normalizeOptionalString(updates.email)
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'notes')) {
    next.notes = normalizeOptionalString(updates.notes)
  }

  await client.send(new PutItemCommand({
    TableName: tableName,
    Item: marshall(buildCustomerItem(tenant, organizationId, next, {
      createdAt: existing.created_at,
      updatedAt: next.updated_at
    }))
  }))

  return next
}

export const deleteDirectoryCustomer = async (
  tenant: string,
  organizationId: string,
  customerId: string
): Promise<void> => {
  const tableName = ensureTableName()
  await client.send(new DeleteItemCommand({
    TableName: tableName,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: customerSk(customerId)
    })
  }))
}

export const createDirectoryCounterparty = async (
  tenant: string,
  organizationId: string,
  input: DirectoryCounterpartyCreateInput
): Promise<DirectoryCounterparty> => {
  const tableName = ensureTableName()
  const now = new Date().toISOString()
  const sequence = await nextDisplayId(tenant, organizationId, 'DIRECTORY_COUNTERPARTY')
  const record: DirectoryCounterparty = {
    id: uuidv4(),
    organization_id: organizationId,
    display_id: formatDisplayId('CP', sequence),
    name: normalizeString(input.name),
    phone: normalizeString(input.phone),
    role: normalizeOptionalString(input.role),
    email: normalizeOptionalString(input.email),
    context: normalizeOptionalString(input.context),
    vendor_id: normalizeOptionalString(input.vendor_id),
    vendor_name: normalizeOptionalString(input.vendor_name),
    created_at: now,
    updated_at: now
  }

  await client.send(new PutItemCommand({
    TableName: tableName,
    Item: marshall(buildCounterpartyItem(tenant, organizationId, record))
  }))

  return record
}

export const updateDirectoryCounterparty = async (
  tenant: string,
  organizationId: string,
  counterpartyId: string,
  updates: DirectoryCounterpartyUpdateInput
): Promise<DirectoryCounterparty | null> => {
  const tableName = ensureTableName()
  const existing = await getDirectoryCounterpartyById(tenant, organizationId, counterpartyId)
  if (!existing) {
    return null
  }

  const next: DirectoryCounterparty = {
    ...existing,
    updated_at: new Date().toISOString()
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    const normalized = normalizeString(updates.name)
    if (!normalized) {
      throw new Error('Name is required.')
    }
    next.name = normalized
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'phone')) {
    const normalized = normalizeString(updates.phone)
    if (!normalized) {
      throw new Error('Phone is required.')
    }
    next.phone = normalized
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'role')) {
    next.role = normalizeOptionalString(updates.role)
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
    next.email = normalizeOptionalString(updates.email)
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'context')) {
    next.context = normalizeOptionalString(updates.context)
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'vendor_id')) {
    next.vendor_id = normalizeOptionalString(updates.vendor_id)
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'vendor_name')) {
    next.vendor_name = normalizeOptionalString(updates.vendor_name)
  }

  await client.send(new PutItemCommand({
    TableName: tableName,
    Item: marshall(buildCounterpartyItem(tenant, organizationId, next, {
      createdAt: existing.created_at,
      updatedAt: next.updated_at
    }))
  }))

  return next
}

export const deleteDirectoryCounterparty = async (
  tenant: string,
  organizationId: string,
  counterpartyId: string
): Promise<void> => {
  const tableName = ensureTableName()
  await client.send(new DeleteItemCommand({
    TableName: tableName,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: counterpartySk(counterpartyId)
    })
  }))
}
