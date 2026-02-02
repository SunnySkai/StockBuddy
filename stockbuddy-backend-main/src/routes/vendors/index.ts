import express, { Response } from 'express'
import type { Express } from 'express'
import multer from 'multer'
import pLimit from 'p-limit'
import { requireLoggedInUser } from '../../decorators/require_param'
import { AuthenticatedRequest, Request } from '../../models/request'
import { createVendor, deleteVendor, getVendorById, listVendors, updateVendor } from '../../daos/vendors'
import { Vendor, VendorCreateInput, VendorUpdateInput } from '../../models/vendor'
import { listMembersByVendor } from '../../daos/members'
import { listInventoryRecords } from '../../daos/inventory_records'
import { listTransactions } from '../../daos/transactions'
import { buildCsvContent, parseSpreadsheet, type ParsedSheetRow } from '../../helpers/spreadsheet'
import type { BulkImportSummary } from '../../models/bulk_import'
import { buildTransactionSummary, toTransactionView } from '../../services/transaction_view'

const route = express.Router()

const sendCsvResponse = (res: Response, filename: string, csv: string): void => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(`${CSV_BOM}${csv}`)
}

const vendorToCsvRow = (vendor: Vendor): Record<string, unknown> => ({
  name: vendor.name,
  balance: vendor.balance
})

const importVendorsFromRows = async (
  tenant: string,
  organizationId: string,
  rows: ParsedSheetRow[]
): Promise<BulkImportSummary> => {
  const limiter = pLimit(3)
  const summary: BulkImportSummary = {
    processed: rows.length,
    created: 0,
    failed: 0,
    errors: []
  }

  await Promise.all(
    rows.map((row) =>
      limiter(async () => {
        try {
          const payload = normalizeCreatePayload(row.values)
          await createVendor(tenant, organizationId, payload)
          summary.created += 1
        } catch (error) {
          summary.failed += 1
          const message = error instanceof Error ? error.message : 'Unable to import row.'
          summary.errors.push({ rowNumber: row.rowNumber, message })
        }
      })
    )
  )

  return summary
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
})
const CSV_BOM = '\ufeff'
const VENDOR_CSV_HEADERS = ['name', 'balance']
const VENDOR_TEMPLATE_HEADERS = ['name', 'balance']
const VENDOR_REQUIRED_COLUMNS = ['name']
const MAX_VENDOR_IMPORT_ROWS = 1000

type OrgContext =
  | {
      tenant: string
      organizationId: string
    }
  | null

const ensureOrgContext = (req: Request, res: Response): OrgContext => {
  const authRequest = req as AuthenticatedRequest
  const user = authRequest.user
  if (!user) {
    res.status(401).json({ success: false, message: 'Access denied.' })
    return null
  }
  if (!user.organization_id) {
    res.status(400).json({ success: false, message: 'Organization membership required.' })
    return null
  }
  return {
    tenant: req.tenant ?? '',
    organizationId: user.organization_id
  }
}

const toNumber = (value: unknown): number => {
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

const toName = (value: unknown): string => {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

const normalizeCreatePayload = (body: unknown): VendorCreateInput => {
  if (!body || typeof body !== 'object') {
    throw new Error('Payload must be an object.')
  }
  const payload = body as Record<string, unknown>
  const name = toName(payload.name ?? payload.vendorName)
  if (!name) {
    throw new Error('Vendor name is required.')
  }
  const input: VendorCreateInput = {
    name,
    balance: toNumber(payload.balance)
  }
  return input
}

const normalizeUpdatePayload = (body: unknown): VendorUpdateInput => {
  if (!body || typeof body !== 'object') {
    throw new Error('Payload must be an object.')
  }
  const payload = body as Record<string, unknown>
  const updates: VendorUpdateInput = {}

  if (Object.prototype.hasOwnProperty.call(payload, 'name') || Object.prototype.hasOwnProperty.call(payload, 'vendorName')) {
    const name = toName(payload.name ?? payload.vendorName)
    if (!name) {
      throw new Error('Vendor name cannot be empty.')
    }
    updates.name = name
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'balance')) {
    updates.balance = toNumber(payload.balance)
  }

  return updates
}

const handleError = (res: Response, error: unknown, fallback: string): void => {
  const message = error instanceof Error ? error.message : fallback
  res.status(400).json({ success: false, message })
}

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
          name: 'Sample Supplier LLC',
          balance: 0
        }
        const csv = buildCsvContent(VENDOR_TEMPLATE_HEADERS, [templateRow])
        sendCsvResponse(res, 'counterparties-template.csv', csv)
        return
      }
      const vendors = await listVendors(context.tenant, context.organizationId)
      const csv = buildCsvContent(VENDOR_CSV_HEADERS, vendors.map(vendorToCsvRow))
      const filename = `counterparties-${new Date().toISOString().split('T')[0]}.csv`
      sendCsvResponse(res, filename, csv)
    } catch (error) {
      handleError(res, error, 'Unable to export counterparties.')
    }
  }
)

route.post(
  '/import',
  requireLoggedInUser(),
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const requestWithFile = req as Request & { file?: Express.Multer.File }
    const file = requestWithFile.file
    if (!file || !file.buffer?.length) {
      res.status(400).json({ success: false, message: 'Upload file is required.' })
      return
    }

    try {
      const parsed = parseSpreadsheet(file.buffer)
      if (!parsed.columns.length) {
        throw new Error('Add a header row to your spreadsheet before uploading.')
      }
      const missingColumns = VENDOR_REQUIRED_COLUMNS.filter(
        (column) => !parsed.columns.includes(column)
      )
      if (missingColumns.length) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`)
      }
      if (!parsed.rows.length) {
        throw new Error('No rows found to import.')
      }
      if (parsed.rows.length > MAX_VENDOR_IMPORT_ROWS) {
        throw new Error(`Please limit imports to ${MAX_VENDOR_IMPORT_ROWS} rows at a time.`)
      }

      const summary = await importVendorsFromRows(
        context.tenant,
        context.organizationId,
        parsed.rows
      )
      res.json({ success: true, data: summary })
    } catch (error) {
      handleError(res, error, 'Unable to import counterparties.')
    }
  }
)

route.get(
  '/',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined
      const vendors = await listVendors(context.tenant, context.organizationId, { search })
      const summary = vendors.reduce(
        (acc, vendor) => {
          acc.total_balance += typeof vendor.balance === 'number' ? vendor.balance : 0
          return acc
        },
        { count: vendors.length, total_balance: 0 }
      )
      res.json({ success: true, data: { vendors, summary } })
    } catch (error) {
      handleError(res, error, 'Unable to load vendors.')
    }
  }
)

route.post(
  '/',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    try {
      const input = normalizeCreatePayload(req.body)
      const vendor = await createVendor(context.tenant, context.organizationId, input)
      res.status(201).json({ success: true, data: vendor })
    } catch (error) {
      handleError(res, error, 'Unable to create vendor.')
    }
  }
)

route.put(
  '/:vendorId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const vendorId = typeof req.params.vendorId === 'string' ? req.params.vendorId.trim() : ''
    if (!vendorId) {
      res.status(400).json({ success: false, message: 'vendorId is required.' })
      return
    }

    try {
      const updates = normalizeUpdatePayload(req.body)
      const vendor = await updateVendor(context.tenant, context.organizationId, vendorId, updates)
      if (!vendor) {
        res.status(404).json({ success: false, message: 'Vendor not found.' })
        return
      }
      res.json({ success: true, data: vendor })
    } catch (error) {
      handleError(res, error, 'Unable to update vendor.')
    }
  }
)

route.delete(
  '/:vendorId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const vendorId = typeof req.params.vendorId === 'string' ? req.params.vendorId.trim() : ''
    if (!vendorId) {
      res.status(400).json({ success: false, message: 'vendorId is required.' })
      return
    }

    try {
      await deleteVendor(context.tenant, context.organizationId, vendorId)
      res.json({ success: true })
    } catch (error) {
      handleError(res, error, 'Unable to delete vendor.')
    }
  }
)

route.get(
  '/:vendorId/transactions',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const vendorId = typeof req.params.vendorId === 'string' ? req.params.vendorId.trim() : ''
    if (!vendorId) {
      res.status(400).json({ success: false, message: 'vendorId is required.' })
      return
    }

    try {
      const vendor = await getVendorById(context.tenant, context.organizationId, vendorId)
      if (!vendor) {
        res.status(404).json({ success: false, message: 'Vendor not found.' })
        return
      }
      const records = await listInventoryRecords(context.tenant, context.organizationId)
      const vendorRecords = records.filter(
        record =>
          record.bought_from_vendor_id === vendorId ||
          record.sold_to_vendor_id === vendorId
      )
      const memberships = await listMembersByVendor(context.tenant, context.organizationId, vendorId)
      const membershipTransactions = memberships.map(member => ({
        id: member.id,
        name: member.name,
        email: member.email,
        membership_type: member.membership_type,
        membership_price: member.membership_price,
        status: member.status,
        created_at: member.created_at,
        updated_at: member.updated_at
      }))
      const transactionsRaw = await listTransactions(context.tenant, context.organizationId, { vendor_id: vendorId })
      const transactions = transactionsRaw.map(toTransactionView)
      const totals = buildTransactionSummary(transactions)
      res.json({
        success: true,
        data: {
          vendor,
          records: vendorRecords,
          memberships: membershipTransactions,
          transactions,
          totals
        }
      })
    } catch (error) {
      handleError(res, error, 'Unable to load vendor transactions.')
    }
  }
)

export = route
