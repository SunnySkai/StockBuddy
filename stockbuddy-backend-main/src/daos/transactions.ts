import { v4 as uuidv4 } from 'uuid'
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import {
  InventoryRecordStatus,
  InventoryRecordType,
  InventoryTransactionAction
} from '../models/inventory_record'
import {
  ManualTransactionDirection,
  ManualTransactionMode,
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType
} from '../models/transaction'
import { organizationPk } from './organization'
import { nextDisplayId } from './counters'

const DEFAULT_STATUS: TransactionStatus = 'Pending'
const TRANSACTION_ENTITY = 'TRANSACTION'
const nowIso = () => new Date().toISOString()
const transactionSk = (transactionId: string) => `INVREC_TX#${transactionId}`
const recordSk = (recordId: string) => `INVREC#${recordId}`

type DynamoClientLike = Pick<DynamoDBClient, 'send'>
let client: DynamoClientLike = new DynamoDBClient({ region: process.env.AWS_REGION })

const normalizeString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null
  }
  const trimmed = String(value).trim()
  return trimmed.length ? trimmed : null
}

const normalizeTransaction = (raw: any): Transaction => {
  const transaction = raw as Transaction & {
    record_status?: InventoryRecordStatus | null
    notes?: string | null
    attachments?: string[]
    manual_direction?: ManualTransactionDirection | null
    manual_mode?: ManualTransactionMode | null
    journal_vendor_id?: string | null
    manual_reference_id?: string | null
  }
  const normalizedAmount = typeof transaction.amount === 'number' ? transaction.amount : 0
  const normalizedPaid =
    typeof transaction.amount_paid === 'number'
      ? transaction.amount_paid
      : transaction.status === 'Paid'
        ? normalizedAmount
        : 0
  const normalizedOwed =
    typeof transaction.amount_owed === 'number'
      ? transaction.amount_owed
      : Math.max(normalizedAmount - normalizedPaid, 0)
  return {
    id: transaction.transaction_id ?? transaction.id,
    transaction_id: transaction.transaction_id ?? transaction.id,
    organization_id: transaction.organization_id,
    tenant: transaction.tenant,
    record_id: normalizeString(transaction.record_id),
    display_id: typeof transaction.display_id === 'number' ? transaction.display_id : null,
    record_type: (transaction.record_type as InventoryRecordType | 'manual' | null) ?? null,
    type: transaction.type,
    action: (transaction.action as InventoryTransactionAction | null) ?? null,
    vendor_id: normalizeString(transaction.vendor_id),
    bank_account_id: normalizeString(transaction.bank_account_id),
    status: transaction.status as TransactionStatus,
    record_status: (transaction.record_status as InventoryRecordStatus | null) ?? null,
    amount: normalizedAmount,
    amount_paid: normalizedPaid,
    amount_owed: normalizedOwed,
    notes: normalizeString(transaction.notes),
    attachments: Array.isArray(transaction.attachments) ? transaction.attachments : [],
    category: (transaction.category as TransactionCategory | null) ?? null,
    created_by_user_id: normalizeString(transaction.created_by_user_id),
    updated_by_user_id: normalizeString(transaction.updated_by_user_id),
    paid_at: normalizeString(transaction.paid_at),
    paid_by_user_id: normalizeString(transaction.paid_by_user_id),
    cancelled_at: normalizeString(transaction.cancelled_at),
    cancelled_by_user_id: normalizeString(transaction.cancelled_by_user_id),
    created_at: transaction.created_at,
    updated_at: transaction.updated_at,
    manual_direction:
      transaction.manual_direction === 'in' || transaction.manual_direction === 'out'
        ? transaction.manual_direction
        : null,
    manual_mode:
      transaction.manual_mode === 'journal_voucher' || transaction.manual_mode === 'standard'
        ? transaction.manual_mode
        : null,
    journal_vendor_id: normalizeString(transaction.journal_vendor_id),
    manual_reference_id: normalizeString(transaction.manual_reference_id)
  }
}

const requireTableName = (): string => {
  const tableName = process.env.TABLE_NAME
  if (!tableName) {
    throw new Error('Missing env variable: TABLE_NAME')
  }
  return tableName
}

export type TransactionCreateInput = {
  transactionId?: string
  recordId?: string | null
  recordType?: InventoryRecordType | 'manual' | null
  type: TransactionType
  vendorId?: string | null
  bankAccountId?: string | null
  status?: TransactionStatus
  recordStatus?: InventoryRecordStatus | null
  amount: number
  displayId?: number | null
  notes?: string | null
  attachments?: string[]
  category?: TransactionCategory | null
  action?: InventoryTransactionAction | null
  createdByUserId?: string | null
  manualDirection?: ManualTransactionDirection | null
  manualMode?: ManualTransactionMode | null
  journalVendorId?: string | null
  manualReferenceId?: string | null
}

const sanitizeAttachments = (values: string[] | undefined): string[] => {
  if (!values) {
    return []
  }
  return values
    .map(value => normalizeString(value))
    .filter((value): value is string => Boolean(value))
}

export const createTransaction = async (
  tenant: string,
  organizationId: string,
  input: TransactionCreateInput
): Promise<Transaction> => {
  const tableName = requireTableName()
  if (!Number.isFinite(input.amount)) {
    throw new Error('Transaction amount must be a number.')
  }
  if (input.amount < 0) {
    throw new Error('Transaction amount cannot be negative.')
  }

  const transactionId = input.transactionId ?? uuidv4()
  const displayId =
    typeof input.displayId === 'number' && Number.isFinite(input.displayId)
      ? input.displayId
      : await nextDisplayId(tenant, organizationId, 'TRANSACTION')
  const now = nowIso()
  const notes = normalizeString(input.notes)

  const item = {
    PK: organizationPk(tenant, organizationId),
    SK: transactionSk(transactionId),
    entity_type: TRANSACTION_ENTITY,
    tenant,
    organization_id: organizationId,
    display_id: displayId,
    transaction_id: transactionId,
    record_id: input.recordId ?? null,
    record_type: input.recordType ?? null,
    type: input.type,
    action: input.action ?? null,
    vendor_id: input.vendorId ?? null,
    bank_account_id: input.bankAccountId ?? null,
    status: input.status ?? DEFAULT_STATUS,
    record_status: input.recordStatus ?? null,
    amount: input.amount,
    amount_paid: 0,
    amount_owed: input.amount,
    notes,
    attachments: sanitizeAttachments(input.attachments),
    category: input.category ?? null,
    created_by_user_id: input.createdByUserId ?? null,
    updated_by_user_id: input.createdByUserId ?? null,
    paid_at: null,
    paid_by_user_id: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    created_at: now,
    updated_at: now,
    manual_direction: input.manualDirection ?? null,
    manual_mode: input.manualMode ?? null,
    journal_vendor_id: input.journalVendorId ?? null,
    manual_reference_id: input.manualReferenceId ?? null
  }

  await client.send(new PutItemCommand({
    TableName: tableName,
    Item: marshall(item)
  }))

  return normalizeTransaction(item)
}

export type TransactionFilters = {
  vendor_id?: string
  status?: TransactionStatus
  type?: TransactionType
  start_date?: string
  end_date?: string
}

const withinDateRange = (recordedAt: string, filters?: TransactionFilters): boolean => {
  if (!filters) return true
  if (filters.start_date && recordedAt < filters.start_date) {
    return false
  }
  if (filters.end_date && recordedAt > filters.end_date) {
    return false
  }
  return true
}

export const listTransactions = async (
  tenant: string,
  organizationId: string,
  filters?: TransactionFilters
): Promise<Transaction[]> => {
  const tableName = requireTableName()

  const response = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: marshall({
      ':pk': organizationPk(tenant, organizationId),
      ':skPrefix': 'INVREC_TX#'
    })
  }))

  let items = response.Items?.map(item => normalizeTransaction(unmarshall(item))) ?? []
  items = await enrichTransactions(tenant, organizationId, items)
  if (filters?.vendor_id) {
    items = items.filter(tx => tx.vendor_id === filters.vendor_id)
  }
  if (filters?.status) {
    items = items.filter(tx => tx.status === filters.status)
  }
  if (filters?.type) {
    items = items.filter(tx => tx.type === filters.type)
  }
  items = items.filter(tx => withinDateRange(tx.created_at, filters))
  items.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return items
}

export const getTransactionById = async (
  tenant: string,
  organizationId: string,
  transactionId: string
): Promise<Transaction | null> => {
  const tableName = requireTableName()
  const response = await client.send(new GetItemCommand({
    TableName: tableName,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: transactionSk(transactionId)
    })
  }))
  if (!response.Item) {
    return null
  }
  return normalizeTransaction(unmarshall(response.Item))
}

export const updateTransactionRecordStatus = async (
  tenant: string,
  organizationId: string,
  transactionId: string,
  status: InventoryRecordStatus | null
): Promise<void> => {
  const tableName = requireTableName()
  await client.send(new UpdateItemCommand({
    TableName: tableName,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: transactionSk(transactionId)
    }),
    UpdateExpression: 'SET record_status = :recordStatus, updated_at = :ua',
    ExpressionAttributeValues: marshall({
      ':recordStatus': status ?? null,
      ':ua': nowIso()
    })
  }))
}

export const setTransactionStatus = async (
  tenant: string,
  organizationId: string,
  transactionId: string,
  status: TransactionStatus,
  actorUserId?: string | null,
  options?: { bankAccountId?: string | null; amountPaid?: number; amountOwed?: number }
): Promise<void> => {
  const tableName = requireTableName()
  const now = nowIso()
  const expressions: string[] = ['#status = :status', 'updated_at = :ua']
  const attrNames: Record<string, string> = { '#status': 'status' }
  const attrValues: Record<string, unknown> = {
    ':status': status,
    ':ua': now,
    ':empty': null,
    ':actor': actorUserId ?? null
  }

  if (actorUserId) {
    expressions.push('updated_by_user_id = :actor')
  }

  const ensureZeroAttr = (): void => {
    if (!Object.prototype.hasOwnProperty.call(attrValues, ':zero')) {
      attrValues[':zero'] = 0
    }
  }

  if (status === 'Paid') {
    attrNames['#amount'] = 'amount'
    ensureZeroAttr()
    expressions.push(
      'paid_at = :ua',
      'paid_by_user_id = :actor',
      'cancelled_at = :empty',
      'cancelled_by_user_id = :empty',
      'bank_account_id = :bank',
      'amount_paid = #amount',
      'amount_owed = :zero'
    )
    attrValues[':bank'] = options?.bankAccountId ?? null
  } else if (status === 'Cancelled') {
    attrNames['#amount'] = 'amount'
    ensureZeroAttr()
    expressions.push(
      'cancelled_at = :ua',
      'cancelled_by_user_id = :actor',
      'paid_at = :empty',
      'paid_by_user_id = :empty',
      'bank_account_id = :empty',
      'amount_paid = :zero',
      'amount_owed = #amount'
    )
  } else if (status === 'Partial') {
    const amountPaid = options?.amountPaid
    const amountOwed = options?.amountOwed
    if (typeof amountPaid !== 'number' || typeof amountOwed !== 'number') {
      throw new Error('Partial payments require amountPaid and amountOwed values.')
    }
    expressions.push(
      'paid_at = :empty',
      'paid_by_user_id = :empty',
      'cancelled_at = :empty',
      'cancelled_by_user_id = :empty',
      'bank_account_id = :bank',
      'amount_paid = :amountPaid',
      'amount_owed = :amountOwed'
    )
    attrValues[':bank'] = options?.bankAccountId ?? null
    attrValues[':amountPaid'] = amountPaid
    attrValues[':amountOwed'] = amountOwed
  } else {
    attrNames['#amount'] = 'amount'
    ensureZeroAttr()
    expressions.push(
      'paid_at = :empty',
      'paid_by_user_id = :empty',
      'cancelled_at = :empty',
      'cancelled_by_user_id = :empty',
      'bank_account_id = :empty',
      'amount_paid = :zero',
      'amount_owed = #amount'
    )
  }

  await client.send(new UpdateItemCommand({
    TableName: tableName,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: transactionSk(transactionId)
    }),
    UpdateExpression: `SET ${expressions.join(', ')}`,
    ExpressionAttributeNames: attrNames,
    ExpressionAttributeValues: marshall(attrValues)
  }))
}

export const overrideTransactionsClient = (override: DynamoClientLike): void => {
  client = override
}

type RecordSnapshot = {
  record_type?: InventoryRecordType
  bought_from_vendor_id?: string | null
  sold_to_vendor_id?: string | null
  cost?: number | null
  selling?: number | null
}

const shouldEnrichTransaction = (transaction: Transaction): boolean => {
  if (!transaction.record_id) return false
  const missingVendor = !transaction.vendor_id
  const missingAmount = !Number.isFinite(transaction.amount) || transaction.amount === 0
  return missingVendor || missingAmount
}

const fetchRecordSnapshot = async (
  tenant: string,
  organizationId: string,
  recordId: string
): Promise<RecordSnapshot | null> => {
  const tableName = requireTableName()
  const response = await client.send(new GetItemCommand({
    TableName: tableName,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: recordSk(recordId)
    }),
    ProjectionExpression: 'record_type, bought_from_vendor_id, sold_to_vendor_id, cost, selling'
  }))
  if (!response.Item) {
    return null
  }
  return unmarshall(response.Item) as RecordSnapshot
}

const resolveVendorFromSnapshot = (
  snapshot: RecordSnapshot,
  type: TransactionType
): string | null => {
  if (type === 'purchase') {
    return snapshot.bought_from_vendor_id ?? null
  }
  if (type === 'order' || type === 'sale') {
    return snapshot.sold_to_vendor_id ?? null
  }
  return snapshot.bought_from_vendor_id ?? snapshot.sold_to_vendor_id ?? null
}

const resolveAmountFromSnapshot = (
  snapshot: RecordSnapshot,
  type: TransactionType
): number | null => {
  if (type === 'purchase') {
    return typeof snapshot.cost === 'number' ? snapshot.cost : null
  }
  if (type === 'order' || type === 'sale') {
    return typeof snapshot.selling === 'number' ? snapshot.selling : null
  }
  if (typeof snapshot.cost === 'number') {
    return snapshot.cost
  }
  if (typeof snapshot.selling === 'number') {
    return snapshot.selling
  }
  return null
}

const enrichTransactions = async (
  tenant: string,
  organizationId: string,
  transactions: Transaction[]
): Promise<Transaction[]> => {
  const needingEnrichment = transactions.filter(shouldEnrichTransaction)
  if (!needingEnrichment.length) {
    return transactions
  }
  const recordIds = Array.from(
    new Set(
      needingEnrichment
        .map(tx => tx.record_id)
        .filter((id): id is string => Boolean(id))
    )
  )
  const snapshots = await Promise.all(
    recordIds.map(async recordId => {
      try {
        const snapshot = await fetchRecordSnapshot(tenant, organizationId, recordId)
        return [recordId, snapshot] as const
      } catch {
        return [recordId, null] as const
      }
    })
  )
  const snapshotMap = new Map<string, RecordSnapshot>()
  snapshots.forEach(([recordId, snapshot]) => {
    if (snapshot) {
      snapshotMap.set(recordId, snapshot)
    }
  })

  return transactions.map(transaction => {
    if (!shouldEnrichTransaction(transaction)) {
      return transaction
    }
    if (!transaction.record_id) {
      return transaction
    }
    const snapshot = snapshotMap.get(transaction.record_id)
    if (!snapshot) {
      return transaction
    }
    const next = { ...transaction }
    if (!next.vendor_id) {
      next.vendor_id = resolveVendorFromSnapshot(snapshot, next.type)
    }
    if (!Number.isFinite(next.amount) || next.amount === 0) {
      const fallbackAmount = resolveAmountFromSnapshot(snapshot, next.type)
      if (typeof fallbackAmount === 'number') {
        next.amount = fallbackAmount
      }
    }
    return next
  })
}
