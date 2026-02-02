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
import { BankAccount, BankAccountCreateInput, BankAccountUpdateInput } from '../models/bank'
import { organizationPk } from './organization'
import { nextDisplayId } from './counters'

const TABLE_NAME = process.env.TABLE_NAME
const client = new DynamoDBClient({ region: process.env.AWS_REGION })

const bankSk = (bankId: string) => `BANK#${bankId}`

const normalizeNumber = (value: unknown): number => {
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) return parsed
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

const normalizeBank = (raw: any): BankAccount => {
  const bank = raw as BankAccount & { balance?: number }
  return {
    id: bank.id,
    organization_id: bank.organization_id,
    display_id: typeof bank.display_id === 'number' ? bank.display_id : null,
    name: normalizeString(bank.name),
    balance: typeof bank.balance === 'number' ? bank.balance : 0,
    created_at: bank.created_at,
    updated_at: bank.updated_at
  }
}

const buildBankItem = (
  tenant: string,
  organizationId: string,
  bank: BankAccount,
  timestamps?: { createdAt?: string; updatedAt?: string }
) => {
  const createdAt = timestamps?.createdAt ?? bank.created_at ?? new Date().toISOString()
  const updatedAt = timestamps?.updatedAt ?? bank.updated_at ?? createdAt

  return {
    PK: organizationPk(tenant, organizationId),
    SK: bankSk(bank.id),
    entity_type: 'ORGANIZATION_BANK',
    tenant,
    organization_id: organizationId,
    display_id: bank.display_id,
    id: bank.id,
    name: bank.name,
    balance: bank.balance,
    created_at: createdAt,
    updated_at: updatedAt
  }
}

export const listBanks = async (
  tenant: string,
  organizationId: string,
  options?: { search?: string }
): Promise<BankAccount[]> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: marshall({
      ':pk': organizationPk(tenant, organizationId),
      ':skPrefix': 'BANK#'
    })
  }))

  let items = response.Items?.map(item => normalizeBank(unmarshall(item))) ?? []
  items = items.sort((a, b) => b.created_at.localeCompare(a.created_at))

  const searchTerm = options?.search?.trim().toLowerCase()
  if (searchTerm) {
    items = items.filter(item => item.name.toLowerCase().includes(searchTerm))
  }

  return items
}

export const getBankById = async (
  tenant: string,
  organizationId: string,
  bankId: string
): Promise<BankAccount | null> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const result = await client.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: bankSk(bankId)
    })
  }))

  if (!result.Item) return null
  return normalizeBank(unmarshall(result.Item))
}

const buildBankFromInput = (
  organizationId: string,
  input: BankAccountCreateInput,
  overrides?: Partial<BankAccount>
): BankAccount => {
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

export const createBank = async (
  tenant: string,
  organizationId: string,
  input: BankAccountCreateInput
): Promise<BankAccount> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const displayId = await nextDisplayId(tenant, organizationId, 'BANK')
  const bank = buildBankFromInput(organizationId, input, { display_id: displayId })
  if (!bank.name) {
    throw new Error('Account name is required.')
  }

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(buildBankItem(tenant, organizationId, bank))
  }))

  return bank
}

export const updateBank = async (
  tenant: string,
  organizationId: string,
  bankId: string,
  updates: BankAccountUpdateInput
): Promise<BankAccount | null> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  const existing = await getBankById(tenant, organizationId, bankId)
  if (!existing) {
    return null
  }

  const next: BankAccount = {
    ...existing,
    updated_at: new Date().toISOString()
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    const normalized = normalizeString(updates.name)
    if (!normalized) {
      throw new Error('Account name is required.')
    }
    next.name = normalized
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'balance')) {
    next.balance = normalizeNumber(updates.balance)
  }

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(buildBankItem(tenant, organizationId, next, {
      createdAt: existing.created_at,
      updatedAt: next.updated_at
    }))
  }))

  return next
}

export const deleteBank = async (
  tenant: string,
  organizationId: string,
  bankId: string
): Promise<void> => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }

  await client.send(new DeleteItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: bankSk(bankId)
    })
  }))
}

export const adjustBankBalance = async (
  tenant: string,
  organizationId: string,
  bankId: string,
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
      SK: bankSk(bankId)
    }),
    UpdateExpression: 'SET updated_at = :ua ADD balance :delta',
    ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
    ExpressionAttributeValues: marshall({
      ':ua': now,
      ':delta': delta
    })
  }))
}
