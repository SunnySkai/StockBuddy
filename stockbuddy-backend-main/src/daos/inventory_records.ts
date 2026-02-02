import { v4 as uuidv4 } from 'uuid'
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  TransactWriteItemsCommandInput,
  UpdateItemCommand
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import {
  InventoryRecord,
  InventoryRecordStatus,
  InventoryRecordType,
  InventoryRecordUpdateInput,
  InventoryTransactionAction,
  InventorySplitPartInput,
  OrderCreateInput,
  PurchaseCreateInput,
  SeatAssignment
} from '../models/inventory_record'
import {
  createTransaction as createTransactionRecord,
  getTransactionById,
  setTransactionStatus,
  updateTransactionRecordStatus
} from './transactions'
import { organizationPk } from './organization'
import { nextDisplayId } from './counters'

const TABLE_NAME = process.env.TABLE_NAME
const client = new DynamoDBClient({ region: process.env.AWS_REGION })

const recordSk = (recordId: string) => `INVREC#${recordId}`
const transactionSk = (transactionId: string) => `INVREC_TX#${transactionId}`

const nowIso = () => new Date().toISOString()
const MAX_SPLIT_PARTS = 12

const normalizeString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed.length ? trimmed : null
}

const normalizeSeatAssignmentsFromStore = (value: unknown): SeatAssignment[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map(entry => {
    if (!entry || typeof entry !== 'object') {
      return { seat_label: null, member_id: null }
    }
    const normalizedEntry = entry as Record<string, unknown>
    return {
      seat_label: normalizeString(
        normalizedEntry.seat_label ?? normalizedEntry.seatLabel ?? normalizedEntry.seat
      ),
      member_id: normalizeString(normalizedEntry.member_id ?? normalizedEntry.memberId)
    }
  })
}

const alignSeatAssignmentsToQuantity = (
  assignments: SeatAssignment[] | undefined,
  quantity: number
): SeatAssignment[] => {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return []
  }
  const sanitized = (assignments ?? []).map(entry => ({
    seat_label: entry ? normalizeString(entry.seat_label) : null,
    member_id: entry ? normalizeString(entry.member_id) : null
  }))
  return sanitized.slice(0, quantity)
}

const roundCurrency = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

const allocateShares = (
  total: number | null,
  quantities: number[],
  totalQuantity: number
): Array<number | null> => {
  if (total === null) {
    return quantities.map(() => null)
  }
  if (!totalQuantity || totalQuantity <= 0) {
    throw new Error('Invalid quantity detected while allocating shares.')
  }
  let assigned = 0
  return quantities.map((quantity, index) => {
    if (index === quantities.length - 1) {
      const remaining = roundCurrency(total - assigned)
      const safeRemaining = remaining < 0 ? 0 : remaining
      assigned += safeRemaining
      return safeRemaining
    }
    const ratio = quantity / totalQuantity
    const rawShare = roundCurrency(total * ratio)
    assigned += rawShare
    return rawShare
  })
}

const normalizeRecord = (raw: any): InventoryRecord => {
  const record = raw as InventoryRecord & {
    bought_from_vendor_id?: string | null
    sold_to_vendor_id?: string | null
    sale_id?: string | null
    source_inventory_id?: string | null
    source_order_id?: string | null
    seat_assignments?: SeatAssignment[]
    notes?: string | null
  }
  return {
    id: record.id,
    organization_id: record.organization_id,
    tenant: record.tenant,
    game_id: normalizeString(record.game_id),
    record_type: record.record_type,
    status: record.status,
    quantity: record.quantity,
    area: normalizeString(record.area),
    block: normalizeString(record.block),
    row: normalizeString(record.row),
    seats: normalizeString(record.seats),
    seat_assignments: normalizeSeatAssignmentsFromStore(record.seat_assignments),
    age_group: normalizeString(record.age_group),
    member_id: normalizeString(record.member_id),
    bought_from: normalizeString(record.bought_from),
    cost: typeof record.cost === 'number' ? record.cost : null,
    order_number: normalizeString(record.order_number),
    sold_to: normalizeString(record.sold_to),
    selling: typeof record.selling === 'number' ? record.selling : null,
    bought_from_vendor_id: normalizeString(record.bought_from_vendor_id),
    sold_to_vendor_id: normalizeString(record.sold_to_vendor_id),
    transaction_id: record.transaction_id,
    sale_id: normalizeString(record.sale_id),
    source_inventory_id: normalizeString(record.source_inventory_id),
    source_order_id: normalizeString(record.source_order_id),
    notes: normalizeString(record.notes),
    created_at: record.created_at,
    updated_at: record.updated_at
  }
}

type MutationOptions = {
  actorUserId?: string | null
}

const assertTableName = () => {
  if (!TABLE_NAME) {
    throw new Error('Missing env variable: TABLE_NAME')
  }
}

export const getInventoryRecord = async (
  tenant: string,
  organizationId: string,
  recordId: string
): Promise<InventoryRecord | null> => {
  assertTableName()
  const response = await client.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: recordSk(recordId)
    })
  }))
  if (!response.Item) {
    return null
  }
  return normalizeRecord(unmarshall(response.Item))
}

const buildBaseRecord = (
  tenant: string,
  organizationId: string,
  recordId: string,
  type: InventoryRecordType,
  status: InventoryRecordStatus,
  values: Record<string, any>
) => ({
  PK: organizationPk(tenant, organizationId),
  SK: recordSk(recordId),
  entity_type: 'INVENTORY_RECORD',
  tenant,
  organization_id: organizationId,
  id: recordId,
  record_type: type,
  status,
  game_id: values.game_id ?? null,
  created_at: nowIso(),
  updated_at: nowIso(),
  ...values
})

const validatePositiveInteger = (value: number, field: string) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`)
  }
}

const validateMoney = (value: number, field: string) => {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a valid number.`)
  }
}

const validateRequired = (value: string, field: string) => {
  if (!value.trim().length) {
    throw new Error(`${field} is required.`)
  }
}

export const listInventoryRecords = async (
  tenant: string,
  organizationId: string,
  options?: { gameId?: string }
): Promise<InventoryRecord[]> => {
  assertTableName()
  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: marshall({
      ':pk': organizationPk(tenant, organizationId),
      ':prefix': 'INVREC#'
    })
  }))

  const items = response.Items ?? []
  let records = items
    .map(item => normalizeRecord(unmarshall(item)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  if (options?.gameId) {
    records = records.filter(record => record.game_id === options.gameId)
  }

  return records
}

export const createPurchaseRecord = async (
  tenant: string,
  organizationId: string,
  input: PurchaseCreateInput,
  options?: MutationOptions
): Promise<InventoryRecord> => {
  assertTableName()
  validatePositiveInteger(input.quantity, 'quantity')
  validateRequired(input.area, 'area')
  validateRequired(input.bought_from, 'bought_from')
  validateMoney(input.cost, 'cost')
  validateRequired(input.game_id, 'game_id')
  if (!input.bought_from_vendor_id) {
    throw new Error('Vendor selection is required for purchases.')
  }

  const recordId = uuidv4()
  const transactionId = uuidv4()
  const seatAssignments = alignSeatAssignmentsToQuantity(input.seat_assignments, input.quantity)

  const item = buildBaseRecord(tenant, organizationId, recordId, 'inventory', 'Available', {
    game_id: input.game_id,
    quantity: input.quantity,
    area: input.area.trim(),
    block: input.block ?? null,
    row: input.row ?? null,
    seats: input.seats ?? null,
    seat_assignments: seatAssignments,
    age_group: input.age_group ?? null,
    member_id: input.member_id ?? null,
    bought_from: input.bought_from.trim(),
    cost: input.cost,
    order_number: null,
    sold_to: null,
    selling: null,
    bought_from_vendor_id: input.bought_from_vendor_id ?? null,
    sold_to_vendor_id: null,
    transaction_id: transactionId,
    sale_id: null,
    source_inventory_id: null,
    source_order_id: null,
    notes: input.notes ?? null
  })

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item)
  }))
  await createTransactionRecord(tenant, organizationId, {
    transactionId,
    recordId,
    recordType: 'inventory',
    type: 'purchase',
    vendorId: input.bought_from_vendor_id,
    amount: input.cost,
    recordStatus: 'Available',
    action: 'create_purchase',
    createdByUserId: options?.actorUserId ?? null,
    category: 'ticket_purchase'
  })

  return normalizeRecord(item)
}

export const createOrderRecord = async (
  tenant: string,
  organizationId: string,
  input: OrderCreateInput,
  options?: MutationOptions
): Promise<InventoryRecord> => {
  assertTableName()
  validatePositiveInteger(input.quantity, 'quantity')
  validateRequired(input.area, 'area')
  validateRequired(input.sold_to, 'sold_to')
  validateMoney(input.selling, 'selling')
  validateRequired(input.game_id, 'game_id')
  if (!input.sold_to_vendor_id) {
    throw new Error('Vendor selection is required for orders.')
  }

  const recordId = uuidv4()
  const transactionId = uuidv4()

  const item = buildBaseRecord(tenant, organizationId, recordId, 'order', 'Unfulfilled', {
    game_id: input.game_id,
    quantity: input.quantity,
    area: input.area.trim(),
    block: input.block ?? null,
    row: input.row ?? null,
    seats: input.seats ?? null,
    seat_assignments: [],
    age_group: input.age_group ?? null,
    member_id: null,
    bought_from: null,
    cost: null,
    order_number: input.order_number ?? null,
    sold_to: input.sold_to.trim(),
    selling: input.selling,
    bought_from_vendor_id: null,
    sold_to_vendor_id: input.sold_to_vendor_id ?? null,
    transaction_id: transactionId,
    sale_id: null,
    source_inventory_id: null,
    source_order_id: null,
    notes: input.notes ?? null
  })

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item)
  }))
  await createTransactionRecord(tenant, organizationId, {
    transactionId,
    recordId,
    recordType: 'order',
    type: 'order',
    vendorId: input.sold_to_vendor_id,
    amount: input.selling,
    recordStatus: 'Unfulfilled',
    action: 'create_order',
    createdByUserId: options?.actorUserId ?? null,
    category: 'ticket_order'
  })

  return normalizeRecord(item)
}

const ensureEditableFields = (record: InventoryRecord, updates: InventoryRecordUpdateInput) => {
  const disallowedInventory: (keyof InventoryRecordUpdateInput)[] = [
    'order_number',
    'sold_to',
    'selling',
    'sold_to_vendor_id'
  ]
  const disallowedOrder: (keyof InventoryRecordUpdateInput)[] = [
    'member_id',
    'bought_from',
    'cost',
    'bought_from_vendor_id'
  ]

  if (record.record_type === 'sale') {
    throw new Error('Sale records cannot be edited manually.')
  }

  for (const key of Object.keys(updates) as (keyof InventoryRecordUpdateInput)[]) {
    if (record.record_type === 'inventory' && disallowedInventory.includes(key)) {
      throw new Error(`${key} cannot be edited on inventory records.`)
    }
    if (record.record_type === 'order' && disallowedOrder.includes(key)) {
      throw new Error(`${key} cannot be edited on order records.`)
    }
  }
}

const enforceStatusRules = (record: InventoryRecord, nextStatus?: InventoryRecordStatus) => {
  if (!nextStatus || nextStatus === record.status) return

  if (record.record_type === 'order') {
    const allowed: InventoryRecordStatus[] = ['Cancelled', 'Unfulfilled']
    if (!allowed.includes(nextStatus)) {
      throw new Error('Order status can only toggle between Cancelled and Unfulfilled.')
    }
    if (nextStatus === 'Cancelled' && record.status !== 'Unfulfilled') {
      throw new Error('Only unfulfilled orders can be cancelled.')
    }
    if (nextStatus === 'Unfulfilled' && record.status !== 'Cancelled') {
      throw new Error('Only cancelled orders can be reopened.')
    }
    return
  }

  if (record.record_type === 'inventory' && nextStatus !== 'Closed') {
    throw new Error('Inventory status can only change to Closed.')
  }
}

export const updateInventoryRecord = async (
  tenant: string,
  organizationId: string,
  recordId: string,
  updates: InventoryRecordUpdateInput,
  options?: MutationOptions
): Promise<InventoryRecord> => {
  assertTableName()
  const existing = await getInventoryRecord(tenant, organizationId, recordId)
  if (!existing) {
    throw new Error('Record not found.')
  }

  ensureEditableFields(existing, updates)
  enforceStatusRules(existing, updates.status)

  const resolvedQuantity = updates.quantity ?? existing.quantity
  const resolvedSeatAssignments =
    updates.seat_assignments !== undefined
      ? alignSeatAssignmentsToQuantity(updates.seat_assignments, resolvedQuantity)
      : updates.quantity !== undefined
        ? alignSeatAssignmentsToQuantity(existing.seat_assignments, resolvedQuantity)
        : existing.seat_assignments

  const next: InventoryRecord = {
    ...existing,
    quantity: resolvedQuantity,
    area: updates.area ?? existing.area,
    block: updates.block ?? existing.block,
    row: updates.row ?? existing.row,
    seats: updates.seats ?? existing.seats,
    seat_assignments: resolvedSeatAssignments,
    age_group: updates.age_group ?? existing.age_group,
    member_id: updates.member_id ?? existing.member_id,
    bought_from: updates.bought_from ?? existing.bought_from,
    bought_from_vendor_id: updates.bought_from_vendor_id ?? existing.bought_from_vendor_id,
    cost: updates.cost ?? existing.cost,
    order_number: updates.order_number ?? existing.order_number,
    sold_to: updates.sold_to ?? existing.sold_to,
    sold_to_vendor_id: updates.sold_to_vendor_id ?? existing.sold_to_vendor_id,
    selling: updates.selling ?? existing.selling,
    status: updates.status ?? existing.status,
    notes: updates.notes ?? existing.notes,
    updated_at: nowIso()
  }

  if (updates.quantity !== undefined) {
    validatePositiveInteger(next.quantity, 'quantity')
  }
  if (updates.cost !== undefined && next.cost !== null) {
    validateMoney(next.cost, 'cost')
  }
  if (updates.selling !== undefined && next.selling !== null) {
    validateMoney(next.selling, 'selling')
  }

  const { tenant: nextTenant, organization_id: nextOrganizationId, ...nextAttributes } = next

  const item = {
    ...nextAttributes,
    tenant: nextTenant,
    organization_id: nextOrganizationId,
    PK: organizationPk(tenant, organizationId),
    SK: recordSk(recordId),
    entity_type: 'INVENTORY_RECORD'
  }

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item)
  }))

  if (updates.status) {
    await updateTransactionRecordStatus(tenant, organizationId, existing.transaction_id, next.status)
    if (updates.status === 'Cancelled') {
      await setTransactionStatus(tenant, organizationId, existing.transaction_id, 'Cancelled', options?.actorUserId)
    } else if (
      updates.status === 'Unfulfilled' &&
      existing.record_type === 'order' &&
      existing.status === 'Cancelled'
    ) {
      await setTransactionStatus(tenant, organizationId, existing.transaction_id, 'Pending', options?.actorUserId)
    }
  }

  return next
}

export const splitInventoryRecord = async (
  tenant: string,
  organizationId: string,
  recordId: string,
  parts: InventorySplitPartInput[],
  options?: MutationOptions
): Promise<InventoryRecord[]> => {
  assertTableName()
  if (!Array.isArray(parts) || parts.length < 2) {
    throw new Error('At least two parts are required to split an inventory record.')
  }
  if (parts.length > MAX_SPLIT_PARTS) {
    throw new Error(`Cannot split a record into more than ${MAX_SPLIT_PARTS} parts at once.`)
  }

  const existing = await getInventoryRecord(tenant, organizationId, recordId)
  if (!existing) {
    throw new Error('Record not found.')
  }
  if (existing.record_type !== 'inventory') {
    throw new Error('Only purchase inventory records can be split.')
  }
  if (existing.status !== 'Available') {
    throw new Error('Only available inventory can be split.')
  }
  if (existing.quantity <= 1) {
    throw new Error('Record quantity must be greater than 1 to split.')
  }

  const sourceTransaction = await getTransactionById(
    tenant,
    organizationId,
    existing.transaction_id
  )
  if (!sourceTransaction) {
    throw new Error('Inventory transaction could not be found.')
  }
  if (sourceTransaction.status !== 'Pending') {
    throw new Error('Only pending purchases can be split.')
  }
  if (sourceTransaction.amount_paid && sourceTransaction.amount_paid > 0) {
    throw new Error('Cannot split inventory that already has recorded payments.')
  }

  const sanitizedParts = parts.map((part, index) => {
    validatePositiveInteger(part.quantity, `parts[${index}].quantity`)
    return {
      quantity: part.quantity,
      seats: normalizeString(part.seats),
      seat_assignments: alignSeatAssignmentsToQuantity(part.seat_assignments, part.quantity),
      member_id: normalizeString(part.member_id)
    }
  })

  const requestedQuantity = sanitizedParts.reduce((total, part) => total + part.quantity, 0)
  if (requestedQuantity !== existing.quantity) {
    throw new Error('Split quantities must add up to the original quantity.')
  }

  const existingAssignments = existing.seat_assignments ?? []
  let preparedAssignments = sanitizedParts
  if (existingAssignments.length === existing.quantity) {
    let cursor = 0
    preparedAssignments = sanitizedParts.map(part => {
      if (part.seat_assignments.length) {
        cursor += part.quantity
        return part
      }
      const assigned = existingAssignments
        .slice(cursor, cursor + part.quantity)
        .map(entry => ({
          seat_label: entry.seat_label,
          member_id: entry.member_id
        }))
      cursor += part.quantity
      return { ...part, seat_assignments: assigned }
    })
  }

  const quantities = preparedAssignments.map(part => part.quantity)
  const costShares = allocateShares(existing.cost, quantities, existing.quantity)
  const transactionAmountShares = allocateShares(
    sourceTransaction.amount,
    quantities,
    existing.quantity
  ) as number[]
  const transactionOwedShares = allocateShares(
    sourceTransaction.amount_owed,
    quantities,
    existing.quantity
  ) as number[]

  const preparedParts = preparedAssignments.map((part, index) => ({
    ...part,
    costShare: costShares[index],
    transactionAmount: transactionAmountShares[index] ?? 0,
    transactionAmountOwed: transactionOwedShares[index] ?? 0
  }))

  const partsWithIdentifiers = preparedParts.map((part, index) => ({
    ...part,
    recordId: index === 0 ? existing.id : uuidv4(),
    transactionId: index === 0 ? existing.transaction_id : uuidv4()
  }))

  const additionalDisplayIds = await Promise.all(
    partsWithIdentifiers.slice(1).map(() => nextDisplayId(tenant, organizationId, 'TRANSACTION'))
  )

  const now = nowIso()
  const updatedExistingPart = partsWithIdentifiers[0]

  const transactItems: NonNullable<TransactWriteItemsCommandInput['TransactItems']> = [
    {
      Update: {
        TableName: TABLE_NAME,
        Key: marshall({
          PK: organizationPk(tenant, organizationId),
          SK: recordSk(existing.id)
        }),
        UpdateExpression:
          'SET quantity = :quantity, seats = :seats, #seatAssignments = :seatAssignments, member_id = :memberId, cost = :cost, updated_at = :ua',
        ConditionExpression: '#status = :available AND #recordType = :inventory AND quantity = :expectedQuantity',
        ExpressionAttributeNames: {
          '#seatAssignments': 'seat_assignments',
          '#status': 'status',
          '#recordType': 'record_type'
        },
        ExpressionAttributeValues: marshall({
          ':quantity': updatedExistingPart.quantity,
          ':seats': updatedExistingPart.seats ?? null,
          ':seatAssignments': updatedExistingPart.seat_assignments,
          ':memberId': updatedExistingPart.member_id ?? null,
          ':cost': updatedExistingPart.costShare ?? null,
          ':ua': now,
          ':available': 'Available',
          ':inventory': 'inventory',
          ':expectedQuantity': existing.quantity
        })
      }
    }
  ]

  const newRecordItems = partsWithIdentifiers.slice(1).map(part => {
    return buildBaseRecord(tenant, organizationId, part.recordId, 'inventory', 'Available', {
      game_id: existing.game_id,
      quantity: part.quantity,
      area: existing.area ?? null,
      block: existing.block ?? null,
      row: existing.row ?? null,
      seats: part.seats ?? null,
    seat_assignments: part.seat_assignments,
    age_group: existing.age_group ?? null,
    member_id: part.member_id ?? null,
    bought_from: existing.bought_from ?? null,
    cost: part.costShare ?? null,
      order_number: null,
      sold_to: null,
      selling: null,
      bought_from_vendor_id: existing.bought_from_vendor_id ?? null,
    sold_to_vendor_id: null,
    transaction_id: part.transactionId,
    sale_id: null,
    source_inventory_id: null,
    source_order_id: null,
    notes: null
  })
  })

  newRecordItems.forEach(item => {
    transactItems.push({
      Put: {
        TableName: TABLE_NAME,
        Item: marshall(item),
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
      }
    })
  })

  transactItems.push({
    Update: {
      TableName: TABLE_NAME,
      Key: marshall({
        PK: organizationPk(tenant, organizationId),
        SK: transactionSk(existing.transaction_id)
      }),
      UpdateExpression: 'SET amount = :amount, amount_owed = :owed, updated_at = :ua',
      ConditionExpression: '#status = :transactionStatus AND amount_paid = :amountPaid',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: marshall({
        ':amount': updatedExistingPart.transactionAmount,
        ':owed': updatedExistingPart.transactionAmountOwed,
        ':ua': now,
        ':transactionStatus': sourceTransaction.status,
        ':amountPaid': sourceTransaction.amount_paid
      })
    }
  })

  const newTransactionCommon = {
    tenant,
    organization_id: organizationId,
    record_type: 'inventory' as InventoryRecordType,
    type: sourceTransaction.type,
    action: 'create_manual' as InventoryTransactionAction,
    vendor_id: sourceTransaction.vendor_id ?? existing.bought_from_vendor_id ?? null,
    bank_account_id: sourceTransaction.bank_account_id ?? null,
    status: sourceTransaction.status,
    record_status: 'Available' as InventoryRecordStatus,
    notes: sourceTransaction.notes ?? null,
    attachments: Array.isArray(sourceTransaction.attachments) ? sourceTransaction.attachments : [],
    category: sourceTransaction.category ?? 'ticket_purchase',
    created_by_user_id: options?.actorUserId ?? sourceTransaction.created_by_user_id ?? null,
    updated_by_user_id:
      options?.actorUserId ??
      sourceTransaction.updated_by_user_id ??
      sourceTransaction.created_by_user_id ??
      null,
    paid_at: null,
    paid_by_user_id: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    manual_direction: sourceTransaction.manual_direction ?? null,
    manual_mode: sourceTransaction.manual_mode ?? null,
    journal_vendor_id: sourceTransaction.journal_vendor_id ?? null,
    manual_reference_id: sourceTransaction.manual_reference_id ?? null
  }

  const newTransactionItems = partsWithIdentifiers.slice(1).map((part, index) => ({
    PK: organizationPk(tenant, organizationId),
    SK: transactionSk(part.transactionId),
    entity_type: 'TRANSACTION',
    tenant,
    organization_id: organizationId,
    display_id: additionalDisplayIds[index],
    transaction_id: part.transactionId,
    record_id: part.recordId,
    record_type: newTransactionCommon.record_type,
    type: newTransactionCommon.type,
    action: newTransactionCommon.action,
    vendor_id: newTransactionCommon.vendor_id,
    bank_account_id: newTransactionCommon.bank_account_id,
    status: newTransactionCommon.status,
    record_status: newTransactionCommon.record_status,
    amount: part.transactionAmount,
    amount_paid: 0,
    amount_owed: part.transactionAmountOwed,
    notes: newTransactionCommon.notes,
    attachments: newTransactionCommon.attachments,
    category: newTransactionCommon.category,
    created_by_user_id: newTransactionCommon.created_by_user_id,
    updated_by_user_id: newTransactionCommon.updated_by_user_id,
    paid_at: newTransactionCommon.paid_at,
    paid_by_user_id: newTransactionCommon.paid_by_user_id,
    cancelled_at: newTransactionCommon.cancelled_at,
    cancelled_by_user_id: newTransactionCommon.cancelled_by_user_id,
    created_at: now,
    updated_at: now,
    manual_direction: newTransactionCommon.manual_direction,
    manual_mode: newTransactionCommon.manual_mode,
    journal_vendor_id: newTransactionCommon.journal_vendor_id,
    manual_reference_id: newTransactionCommon.manual_reference_id
  }))

  newTransactionItems.forEach(item => {
    transactItems.push({
      Put: {
        TableName: TABLE_NAME,
        Item: marshall(item),
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
      }
    })
  })

  await client.send(new TransactWriteItemsCommand({
    TransactItems: transactItems
  }))

  const updatedRecord: InventoryRecord = {
    ...existing,
    quantity: updatedExistingPart.quantity,
    seats: updatedExistingPart.seats,
    seat_assignments: updatedExistingPart.seat_assignments,
    member_id: updatedExistingPart.member_id,
    cost: updatedExistingPart.costShare ?? null,
    notes: null,
    updated_at: now
  }

  const createdRecords = newRecordItems.map(item => normalizeRecord(item))
  return [updatedRecord, ...createdRecords]
}

export const deleteInventoryRecord = async (
  tenant: string,
  organizationId: string,
  recordId: string,
  options?: MutationOptions
): Promise<void> => {
  assertTableName()
  const existing = await getInventoryRecord(tenant, organizationId, recordId)
  if (!existing) {
    throw new Error('Record not found.')
  }

  if (existing.record_type === 'sale') {
    throw new Error('Sale records cannot be deleted. Unassign instead.')
  }
  if (existing.record_type === 'inventory' && existing.status !== 'Available') {
    throw new Error('Only available inventory can be deleted.')
  }
  if (existing.record_type === 'order' && existing.status !== 'Unfulfilled') {
    throw new Error('Only unfulfilled orders can be deleted.')
  }

  await client.send(new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: recordSk(recordId)
    }),
    UpdateExpression: 'SET #status = :cancelled, updated_at = :ua',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: marshall({
      ':cancelled': 'Cancelled',
      ':ua': nowIso()
    })
  }))

  await Promise.all([
    updateTransactionRecordStatus(tenant, organizationId, existing.transaction_id, 'Cancelled'),
    setTransactionStatus(tenant, organizationId, existing.transaction_id, 'Cancelled', options?.actorUserId)
  ])
}

export const assignInventoryToOrder = async (
  tenant: string,
  organizationId: string,
  inventoryId: string,
  orderId: string,
  options?: MutationOptions
): Promise<InventoryRecord> => {
  assertTableName()
  const [inventory, order] = await Promise.all([
    getInventoryRecord(tenant, organizationId, inventoryId),
    getInventoryRecord(tenant, organizationId, orderId)
  ])

  if (!inventory || !order) {
    throw new Error('Inventory or order not found.')
  }
  if (inventory.record_type !== 'inventory' || inventory.status !== 'Available') {
    throw new Error('Inventory must be available.')
  }
  if (order.record_type !== 'order' || order.status !== 'Unfulfilled') {
    throw new Error('Order must be unfulfilled.')
  }
  if (inventory.quantity !== order.quantity) {
    throw new Error('Quantity mismatch between inventory and order.')
  }

  const saleId = uuidv4()
  const saleTransactionId = order.transaction_id
  const saleSeatAssignments = alignSeatAssignmentsToQuantity(inventory.seat_assignments, order.quantity)

  const saleItem = buildBaseRecord(tenant, organizationId, saleId, 'sale', 'Reserved', {
    game_id: order.game_id ?? inventory.game_id ?? null,
    quantity: order.quantity,
    area: order.area ?? inventory.area,
    block: order.block ?? inventory.block,
    row: order.row ?? inventory.row,
    seats: order.seats ?? inventory.seats,
    seat_assignments: saleSeatAssignments,
    age_group: order.age_group ?? inventory.age_group,
    member_id: inventory.member_id,
    bought_from: inventory.bought_from,
    cost: inventory.cost,
    order_number: order.order_number,
    sold_to: order.sold_to,
    selling: order.selling,
    bought_from_vendor_id: inventory.bought_from_vendor_id,
    sold_to_vendor_id: order.sold_to_vendor_id,
    transaction_id: saleTransactionId,
    sale_id: null,
    source_inventory_id: inventory.id,
    source_order_id: order.id
  })

  const timestamp = nowIso()

  await client.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: marshall(saleItem),
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
        }
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: marshall({
            PK: organizationPk(tenant, organizationId),
            SK: recordSk(inventory.id)
          }),
          UpdateExpression: 'SET #status = :reserved, sale_id = :saleId, updated_at = :ua',
          ConditionExpression: '#status = :available',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: marshall({
            ':reserved': 'Reserved',
            ':available': 'Available',
            ':saleId': saleId,
            ':ua': timestamp
          })
        }
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: marshall({
            PK: organizationPk(tenant, organizationId),
            SK: recordSk(order.id)
          }),
          UpdateExpression: 'SET #status = :reserved, sale_id = :saleId, updated_at = :ua',
          ConditionExpression: '#status = :unfulfilled',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: marshall({
            ':reserved': 'Reserved',
            ':unfulfilled': 'Unfulfilled',
            ':saleId': saleId,
            ':ua': timestamp
          })
        }
      }
    ]
  }))

  await Promise.all([
    updateTransactionRecordStatus(tenant, organizationId, inventory.transaction_id, 'Reserved'),
    updateTransactionRecordStatus(tenant, organizationId, order.transaction_id, 'Reserved')
  ])

  return normalizeRecord(saleItem)
}

export const unassignSale = async (
  tenant: string,
  organizationId: string,
  saleId: string,
  options?: MutationOptions
): Promise<void> => {
  assertTableName()
  const sale = await getInventoryRecord(tenant, organizationId, saleId)
  if (!sale || sale.record_type !== 'sale') {
    throw new Error('Sale not found.')
  }
  if (sale.status !== 'Reserved') {
    throw new Error('Only reserved sales can be unassigned.')
  }
  if (!sale.source_inventory_id || !sale.source_order_id) {
    throw new Error('Sale is missing source references.')
  }

  const [inventory, order] = await Promise.all([
    getInventoryRecord(tenant, organizationId, sale.source_inventory_id),
    getInventoryRecord(tenant, organizationId, sale.source_order_id)
  ])

  if (!inventory || !order) {
    throw new Error('Linked inventory or order not found.')
  }

  const timestamp = nowIso()

  await client.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Update: {
          TableName: TABLE_NAME,
          Key: marshall({
            PK: organizationPk(tenant, organizationId),
            SK: recordSk(inventory.id)
          }),
          UpdateExpression: 'SET #status = :available, sale_id = :empty, updated_at = :ua',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: marshall({
            ':available': 'Available',
            ':empty': null,
            ':ua': timestamp
          })
        }
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: marshall({
            PK: organizationPk(tenant, organizationId),
            SK: recordSk(order.id)
          }),
          UpdateExpression: 'SET #status = :unfulfilled, sale_id = :empty, updated_at = :ua',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: marshall({
            ':unfulfilled': 'Unfulfilled',
            ':empty': null,
            ':ua': timestamp
          })
        }
      },
      {
        Delete: {
          TableName: TABLE_NAME,
          Key: marshall({
            PK: organizationPk(tenant, organizationId),
            SK: recordSk(sale.id)
          })
        }
      }
    ]
  }))

  await Promise.all([
    updateTransactionRecordStatus(tenant, organizationId, inventory.transaction_id, 'Available'),
    updateTransactionRecordStatus(tenant, organizationId, order.transaction_id, 'Unfulfilled')
  ])
}

export const completeSale = async (
  tenant: string,
  organizationId: string,
  saleId: string
): Promise<void> => {
  assertTableName()
  const sale = await getInventoryRecord(tenant, organizationId, saleId)
  if (!sale || sale.record_type !== 'sale') {
    throw new Error('Sale not found.')
  }
  if (sale.status !== 'Reserved') {
    throw new Error('Only reserved sales can be completed.')
  }
  if (!sale.source_inventory_id || !sale.source_order_id) {
    throw new Error('Sale is missing source references.')
  }

  const [inventory, order] = await Promise.all([
    getInventoryRecord(tenant, organizationId, sale.source_inventory_id),
    getInventoryRecord(tenant, organizationId, sale.source_order_id)
  ])

  if (!inventory || !order) {
    throw new Error('Linked inventory or order not found.')
  }

  const timestamp = nowIso()

  await client.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Update: {
          TableName: TABLE_NAME,
          Key: marshall({
            PK: organizationPk(tenant, organizationId),
            SK: recordSk(sale.id)
          }),
          UpdateExpression: 'SET #status = :completed, updated_at = :ua',
          ConditionExpression: '#status = :reserved',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: marshall({
            ':completed': 'Completed',
            ':reserved': 'Reserved',
            ':ua': timestamp
          })
        }
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: marshall({
            PK: organizationPk(tenant, organizationId),
            SK: recordSk(inventory.id)
          }),
          UpdateExpression: 'SET #status = :closed, updated_at = :ua',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: marshall({
            ':closed': 'Closed',
            ':ua': timestamp
          })
        }
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: marshall({
            PK: organizationPk(tenant, organizationId),
            SK: recordSk(order.id)
          }),
          UpdateExpression: 'SET #status = :completed, updated_at = :ua',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: marshall({
            ':completed': 'Completed',
            ':ua': timestamp
          })
        }
      }
    ]
  }))

  await Promise.all([
    updateTransactionRecordStatus(tenant, organizationId, inventory.transaction_id, 'Closed'),
    updateTransactionRecordStatus(tenant, organizationId, order.transaction_id, 'Completed')
  ])
}
