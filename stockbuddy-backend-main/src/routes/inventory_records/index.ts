import express, { Response } from 'express'
import { requireLoggedInUser } from '../../decorators/require_param'
import { AuthenticatedRequest, Request } from '../../models/request'
import {
  assignInventoryToOrder,
  completeSale,
  createOrderRecord,
  createPurchaseRecord,
  deleteInventoryRecord,
  getInventoryRecord,
  listInventoryRecords,
  splitInventoryRecord,
  unassignSale,
  updateInventoryRecord
} from '../../daos/inventory_records'
import { getVendorById } from '../../daos/vendors'
import {
  InventoryRecord,
  InventoryRecordStatus,
  InventoryRecordType,
  InventoryRecordUpdateInput,
  InventorySplitPartInput,
  OrderCreateInput,
  PurchaseCreateInput,
  SeatAssignment
} from '../../models/inventory_record'
import { buildCsvContent } from '../../helpers/spreadsheet'

const route = express.Router()

const sendCsvResponse = (res: Response, filename: string, csv: string): void => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(`${CSV_BOM}${csv}`)
}

const formatSeatAssignments = (assignments: SeatAssignment[]): string => {
  if (!assignments.length) {
    return ''
  }
  return assignments
    .map((assignment, index) => {
      const seatLabel = assignment.seat_label ?? `seat_${index + 1}`
      const member = assignment.member_id ? ` -> ${assignment.member_id}` : ''
      return `${seatLabel}${member}`
    })
    .join(' | ')
}

const inventoryToCsvRow = (record: InventoryRecord): Record<string, unknown> => ({
  id: record.id,
  record_type: record.record_type,
  status: record.status,
  game_id: record.game_id ?? '',
  quantity: record.quantity,
  area: record.area ?? '',
  block: record.block ?? '',
  row: record.row ?? '',
  seats: record.seats ?? '',
  age_group: record.age_group ?? '',
  member_id: record.member_id ?? '',
  bought_from: record.bought_from ?? '',
  bought_from_vendor_id: record.bought_from_vendor_id ?? '',
  sold_to: record.sold_to ?? '',
  sold_to_vendor_id: record.sold_to_vendor_id ?? '',
  cost: record.cost ?? '',
  selling: record.selling ?? '',
  order_number: record.order_number ?? '',
  seat_assignments: formatSeatAssignments(record.seat_assignments ?? []),
  source_inventory_id: record.source_inventory_id ?? '',
  source_order_id: record.source_order_id ?? '',
  sale_id: record.sale_id ?? '',
  notes: record.notes ?? '',
  created_at: record.created_at,
  updated_at: record.updated_at
})
const CSV_BOM = '\ufeff'
const INVENTORY_CSV_HEADERS = [
  'id',
  'record_type',
  'status',
  'game_id',
  'quantity',
  'area',
  'block',
  'row',
  'seats',
  'age_group',
  'member_id',
  'bought_from',
  'bought_from_vendor_id',
  'sold_to',
  'sold_to_vendor_id',
  'cost',
  'selling',
  'order_number',
  'seat_assignments',
  'source_inventory_id',
  'source_order_id',
  'sale_id',
  'notes',
  'created_at',
  'updated_at'
]
const INVENTORY_TEMPLATE_HEADERS = [
  'record_type',
  'status',
  'game_id',
  'quantity',
  'area',
  'block',
  'row',
  'seats',
  'age_group',
  'member_id',
  'bought_from',
  'bought_from_vendor_id',
  'sold_to',
  'sold_to_vendor_id',
  'cost',
  'selling',
  'order_number',
  'seat_assignments',
  'notes'
]

type OrgContext = { tenant: string; organizationId: string; userId: string } | null

const ensureOrgContext = (req: Request, res: Response): OrgContext => {
  const auth = req as AuthenticatedRequest
  const user = auth.user
  if (!user) {
    res.status(401).json({ success: false, message: 'Access denied.' })
    return null
  }
  if (!user.organization_id) {
    res.status(400).json({ success: false, message: 'Organization membership required.' })
    return null
  }
  return { tenant: req.tenant ?? '', organizationId: user.organization_id, userId: user.id }
}

const toPositiveInt = (value: unknown, label: string): number => {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${label} must be a positive integer.`)
  }
  return numberValue
}

const toNumber = (value: unknown, label: string): number => {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} must be a number.`)
  }
  return numberValue
}

const toRequiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required.`)
  }
  const trimmed = value.trim()
  if (!trimmed.length) {
    throw new Error(`${label} is required.`)
  }
  return trimmed
}

const toOptionalString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null
  }
  const normalized = String(value).trim()
  return normalized.length ? normalized : null
}

const normalizeSeatAssignments = (value: unknown): SeatAssignment[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map(entry => {
    if (!entry || typeof entry !== 'object') {
      return { seat_label: null, member_id: null }
    }
    const normalizedEntry = entry as Record<string, unknown>
    return {
      seat_label: toOptionalString(
        normalizedEntry.seat_label ?? normalizedEntry.seatLabel ?? normalizedEntry.seat
      ),
      member_id: toOptionalString(
        normalizedEntry.member_id ?? normalizedEntry.memberId
      )
    }
  })
}

const toRequiredId = (value: unknown, label: string): string => {
  const normalized = toRequiredString(value, label)
  return normalized
}

const ensureVendorExists = async (
  tenant: string,
  organizationId: string,
  vendorId: string
): Promise<void> => {
  const vendor = await getVendorById(tenant, organizationId, vendorId)
  if (!vendor) {
    throw new Error('Vendor not found.')
  }
}

const normalizePurchasePayload = (payload: Record<string, unknown>): PurchaseCreateInput => {
  return {
    game_id: toRequiredString(payload.game_id ?? payload.gameId, 'game_id'),
    quantity: toPositiveInt(payload.quantity, 'quantity'),
    area: toRequiredString(payload.area, 'area'),
    block: toOptionalString(payload.block),
    row: toOptionalString(payload.row),
    seats: toOptionalString(payload.seats),
    seat_assignments: normalizeSeatAssignments(payload.seat_assignments ?? payload.seatAssignments),
    age_group: toOptionalString(payload.age_group ?? payload.ageGroup),
    member_id: toOptionalString(payload.member_id ?? payload.memberId),
    bought_from: toRequiredString(payload.bought_from ?? payload.boughtFrom, 'bought_from'),
    bought_from_vendor_id: toRequiredId(payload.bought_from_vendor_id ?? payload.boughtFromVendorId, 'bought_from_vendor_id'),
    cost: toNumber(payload.cost, 'cost'),
    notes: toOptionalString(payload.notes)
  }
}

const normalizeOrderPayload = (payload: Record<string, unknown>): OrderCreateInput => {
  return {
    game_id: toRequiredString(payload.game_id ?? payload.gameId, 'game_id'),
    quantity: toPositiveInt(payload.quantity, 'quantity'),
    area: toRequiredString(payload.area, 'area'),
    block: toOptionalString(payload.block),
    row: toOptionalString(payload.row),
    seats: toOptionalString(payload.seats),
    age_group: toOptionalString(payload.age_group ?? payload.ageGroup),
    order_number: toOptionalString(payload.order_number ?? payload.orderNumber),
    sold_to: toRequiredString(payload.sold_to ?? payload.soldTo, 'sold_to'),
    sold_to_vendor_id: toRequiredId(payload.sold_to_vendor_id ?? payload.soldToVendorId, 'sold_to_vendor_id'),
    selling: toNumber(payload.selling, 'selling'),
    notes: toOptionalString(payload.notes)
  }
}

const normalizeUpdatePayload = (payload: Record<string, unknown>): InventoryRecordUpdateInput => {
  const updates: InventoryRecordUpdateInput = {}
  if (payload.quantity !== undefined) {
    updates.quantity = toPositiveInt(payload.quantity, 'quantity')
  }
  if (payload.area !== undefined) updates.area = toRequiredString(payload.area, 'area')
  if (payload.block !== undefined) updates.block = toOptionalString(payload.block)
  if (payload.row !== undefined) updates.row = toOptionalString(payload.row)
  if (payload.seats !== undefined) updates.seats = toOptionalString(payload.seats)
  if (payload.seat_assignments !== undefined || payload.seatAssignments !== undefined) {
    updates.seat_assignments = normalizeSeatAssignments(payload.seat_assignments ?? payload.seatAssignments)
  }
  if (payload.age_group !== undefined || payload.ageGroup !== undefined) {
    updates.age_group = toOptionalString(payload.age_group ?? payload.ageGroup)
  }
  if (payload.member_id !== undefined || payload.memberId !== undefined) {
    updates.member_id = toOptionalString(payload.member_id ?? payload.memberId)
  }
  if (payload.bought_from !== undefined || payload.boughtFrom !== undefined) {
    updates.bought_from = toOptionalString(payload.bought_from ?? payload.boughtFrom)
  }
  if (payload.bought_from_vendor_id !== undefined || payload.boughtFromVendorId !== undefined) {
    updates.bought_from_vendor_id = toOptionalString(payload.bought_from_vendor_id ?? payload.boughtFromVendorId)
  }
  if (payload.cost !== undefined) {
    updates.cost = toNumber(payload.cost, 'cost')
  }
  if (payload.order_number !== undefined || payload.orderNumber !== undefined) {
    updates.order_number = toOptionalString(payload.order_number ?? payload.orderNumber)
  }
  if (payload.sold_to !== undefined || payload.soldTo !== undefined) {
    updates.sold_to = toOptionalString(payload.sold_to ?? payload.soldTo)
  }
  if (payload.sold_to_vendor_id !== undefined || payload.soldToVendorId !== undefined) {
    updates.sold_to_vendor_id = toOptionalString(payload.sold_to_vendor_id ?? payload.soldToVendorId)
  }
  if (payload.selling !== undefined) {
    updates.selling = toNumber(payload.selling, 'selling')
  }
  if (payload.status !== undefined) {
    updates.status = toRequiredString(payload.status, 'status') as InventoryRecordStatus
  }
  if (payload.notes !== undefined) {
    updates.notes = toOptionalString(payload.notes)
  }
  return updates
}

const normalizeSplitPartsPayload = (value: unknown): InventorySplitPartInput[] => {
  if (!Array.isArray(value)) {
    throw new Error('parts must be an array.')
  }
  if (value.length < 2) {
    throw new Error('Provide at least two parts to split an inventory record.')
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`parts[${index}] must be an object.`)
    }
    const normalizedEntry = entry as Record<string, unknown>
    const seatAssignmentsSource =
      normalizedEntry.seat_assignments ?? normalizedEntry.seatAssignments ?? undefined
    return {
      quantity: toPositiveInt(normalizedEntry.quantity, `parts[${index}].quantity`),
      seats: toOptionalString(normalizedEntry.seats),
      seat_assignments: normalizeSeatAssignments(seatAssignmentsSource),
      member_id: toOptionalString(normalizedEntry.member_id ?? normalizedEntry.memberId)
    }
  })
}

const applySearchFilters = (
  records: InventoryRecord[],
  params: { status?: string; recordType?: string; query?: string }
) => {
  const { status, recordType, query } = params
  return records.filter(record => {
    if (status && record.status !== status) return false
    if (recordType && record.record_type !== recordType) return false
    if (query) {
      const needle = query.toLowerCase()
      const haystack = [
        record.area,
        record.block,
        record.row,
        record.seats,
        record.order_number,
        record.sold_to,
        record.bought_from
      ]
        .filter(Boolean)
        .map(value => value!.toLowerCase())
        .join(' ')
      if (!haystack.includes(needle)) {
        return false
      }
    }
    return true
  })
}

route.get(
  '/',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    try {
      const gameId = typeof req.query.game_id === 'string' ? req.query.game_id : undefined
      const records = await listInventoryRecords(context.tenant, context.organizationId, { gameId })
      const filtered = applySearchFilters(records, {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        recordType: typeof req.query.record_type === 'string' ? req.query.record_type : undefined,
        query: typeof req.query.q === 'string' ? req.query.q : undefined
      })
      res.json({ success: true, data: filtered })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch inventory records.'
      res.status(500).json({ success: false, message })
    }
  }
)

route.get(
  '/export',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    try {
      const templateRequested =
        typeof req.query.template === 'string' &&
        ['1', 'true', 'yes'].includes(req.query.template.toLowerCase())
      if (templateRequested) {
        const templateRow = {
          record_type: 'inventory',
          status: 'Available',
          game_id: 'GAME-001',
          quantity: 2,
          area: 'Lower Level 105',
          block: '105',
          row: 'C',
          seats: '5-6',
          age_group: 'Adult',
          member_id: '',
          bought_from: 'Ticket Supplier LLC',
          bought_from_vendor_id: 'VENDOR-001',
          sold_to: '',
          sold_to_vendor_id: '',
          cost: 350,
          selling: '',
          order_number: '',
          seat_assignments: 'A1 -> memberID, A2 -> memberID',
          notes: ''
        }
        const csv = buildCsvContent(INVENTORY_TEMPLATE_HEADERS, [templateRow])
        sendCsvResponse(res, 'inventory-template.csv', csv)
        return
      }
      const gameId = typeof req.query.game_id === 'string' ? req.query.game_id : undefined
      const records = await listInventoryRecords(context.tenant, context.organizationId, { gameId })
      const filtered = applySearchFilters(records, {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        recordType: typeof req.query.record_type === 'string' ? req.query.record_type : undefined,
        query: typeof req.query.q === 'string' ? req.query.q : undefined
      })
      const csv = buildCsvContent(INVENTORY_CSV_HEADERS, filtered.map(inventoryToCsvRow))
      const filename = `inventory-${new Date().toISOString().split('T')[0]}.csv`
      sendCsvResponse(res, filename, csv)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export inventory records.'
      res.status(400).json({ success: false, message })
    }
  }
)

route.post(
  '/purchases',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    try {
      if (typeof req.body !== 'object' || req.body === null) {
        throw new Error('Payload required.')
      }
      const payload = normalizePurchasePayload(req.body as Record<string, unknown>)
      await ensureVendorExists(context.tenant, context.organizationId, payload.bought_from_vendor_id)
      const created = await createPurchaseRecord(
        context.tenant,
        context.organizationId,
        payload,
        { actorUserId: context.userId }
      )
      res.status(201).json({ success: true, data: created })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create purchase.'
      res.status(400).json({ success: false, message })
    }
  }
)

route.post(
  '/orders',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    try {
      if (typeof req.body !== 'object' || req.body === null) {
        throw new Error('Payload required.')
      }
      const payload = normalizeOrderPayload(req.body as Record<string, unknown>)
      await ensureVendorExists(context.tenant, context.organizationId, payload.sold_to_vendor_id)
      const created = await createOrderRecord(
        context.tenant,
        context.organizationId,
        payload,
        { actorUserId: context.userId }
      )
      res.status(201).json({ success: true, data: created })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create order.'
      res.status(400).json({ success: false, message })
    }
  }
)

route.patch(
  '/:recordId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const recordId = typeof req.params.recordId === 'string' ? req.params.recordId : ''
    if (!recordId.trim().length) {
      res.status(400).json({ success: false, message: 'recordId is required.' })
      return
    }

    if (typeof req.body !== 'object' || req.body === null) {
      res.status(400).json({ success: false, message: 'Payload required.' })
      return
    }

    try {
      const updates = normalizeUpdatePayload(req.body as Record<string, unknown>)
      if (!Object.keys(updates).length) {
        res.status(400).json({ success: false, message: 'Provide at least one field to update.' })
        return
      }
      const updated = await updateInventoryRecord(
        context.tenant,
        context.organizationId,
        recordId,
        updates,
        { actorUserId: context.userId }
      )
      res.json({ success: true, data: updated })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update record.'
      res.status(400).json({ success: false, message })
    }
  }
)

route.delete(
  '/:recordId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const recordId = typeof req.params.recordId === 'string' ? req.params.recordId : ''
    if (!recordId.trim().length) {
      res.status(400).json({ success: false, message: 'recordId is required.' })
      return
    }

    try {
      await deleteInventoryRecord(
        context.tenant,
        context.organizationId,
        recordId,
        { actorUserId: context.userId }
      )
      res.json({ success: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete record.'
      res.status(400).json({ success: false, message })
    }
  }
)

route.post(
  '/:recordId/split',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const recordId = typeof req.params.recordId === 'string' ? req.params.recordId : ''
    if (!recordId.trim().length) {
      res.status(400).json({ success: false, message: 'recordId is required.' })
      return
    }

    const payload = req.body
    const partsSource = Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object'
        ? payload.parts
        : null

    if (!partsSource) {
      res.status(400).json({ success: false, message: 'parts array is required.' })
      return
    }

    try {
      const parts = normalizeSplitPartsPayload(partsSource)
      const records = await splitInventoryRecord(
        context.tenant,
        context.organizationId,
        recordId,
        parts,
        { actorUserId: context.userId }
      )
      res.status(201).json({ success: true, data: records })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to split record.'
      res.status(400).json({ success: false, message })
    }
  }
)

route.post(
  '/assignments',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const inventoryId = typeof req.body?.inventory_id === 'string' ? req.body.inventory_id : req.body?.inventoryId
    const orderId = typeof req.body?.order_id === 'string' ? req.body.order_id : req.body?.orderId

    if (typeof inventoryId !== 'string' || !inventoryId.trim() || typeof orderId !== 'string' || !orderId.trim()) {
      res.status(400).json({ success: false, message: 'inventory_id and order_id are required.' })
      return
    }

    try {
      const sale = await assignInventoryToOrder(
        context.tenant,
        context.organizationId,
        inventoryId,
        orderId,
        { actorUserId: context.userId }
      )
      res.status(201).json({ success: true, data: sale })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to assign inventory to order.'
      res.status(400).json({ success: false, message })
    }
  }
)

route.post(
  '/sales/:saleId/unassign',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const saleId = typeof req.params.saleId === 'string' ? req.params.saleId : ''
    if (!saleId.trim().length) {
      res.status(400).json({ success: false, message: 'saleId is required.' })
      return
    }

    try {
      await unassignSale(
        context.tenant,
        context.organizationId,
        saleId,
        { actorUserId: context.userId }
      )
      res.json({ success: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unassign sale.'
      res.status(400).json({ success: false, message })
    }
  }
)

route.post(
  '/sales/:saleId/complete',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const saleId = typeof req.params.saleId === 'string' ? req.params.saleId : ''
    if (!saleId.trim().length) {
      res.status(400).json({ success: false, message: 'saleId is required.' })
      return
    }

    try {
      await completeSale(context.tenant, context.organizationId, saleId)
      res.json({ success: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to complete sale.'
      res.status(400).json({ success: false, message })
    }
  }
)

route.get(
  '/:recordId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const recordId = typeof req.params.recordId === 'string' ? req.params.recordId : ''
    if (!recordId.trim()) {
      res.status(400).json({ success: false, message: 'recordId is required.' })
      return
    }

    try {
      const record = await getInventoryRecord(context.tenant, context.organizationId, recordId)
      if (!record) {
        res.status(404).json({ success: false, message: 'Record not found.' })
        return
      }
      res.json({ success: true, data: record })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch record.'
      res.status(500).json({ success: false, message })
    }
  }
)

export = route
