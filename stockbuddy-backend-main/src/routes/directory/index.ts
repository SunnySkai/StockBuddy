import express, { Response } from 'express'
import multer from 'multer'
import pLimit from 'p-limit'
import { requireLoggedInUser } from '../../decorators/require_param'
import { AuthenticatedRequest, Request } from '../../models/request'
import {
  createDirectoryCounterparty,
  createDirectoryCustomer,
  deleteDirectoryCounterparty,
  deleteDirectoryCustomer,
  listDirectoryCounterparties,
  listDirectoryCustomers,
  updateDirectoryCounterparty,
  updateDirectoryCustomer
} from '../../daos/directory'
import {
  DirectoryCounterparty,
  DirectoryCounterpartyCreateInput,
  DirectoryCounterpartyUpdateInput,
  DirectoryCustomer,
  DirectoryCustomerCreateInput,
  DirectoryCustomerUpdateInput
} from '../../models/directory'
import { getVendorById } from '../../daos/vendors'
import { buildCsvContent, parseSpreadsheet, type ParsedSheetRow } from '../../helpers/spreadsheet'
import type { BulkImportSummary } from '../../models/bulk_import'

import type { Express } from 'express'

const route = express.Router()

const sendCsvResponse = (res: Response, filename: string, csv: string): void => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(`${CSV_BOM}${csv}`)
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
})

const CSV_BOM = '\ufeff'
const DIRECTORY_CUSTOMER_CSV_HEADERS = [
  'name',
  'number',
  'email',
  'notes',
  'display_id',
  'created_at',
  'updated_at'
]
const DIRECTORY_CUSTOMER_TEMPLATE_HEADERS = ['name', 'number', 'email', 'notes']
const DIRECTORY_COUNTERPARTY_CSV_HEADERS = [
  'name',
  'phone',
  'role',
  'email',
  'context',
  'vendor_id',
  'vendor_name',
  'display_id',
  'created_at',
  'updated_at'
]
const DIRECTORY_COUNTERPARTY_TEMPLATE_HEADERS = ['name', 'phone', 'role', 'email', 'context', 'vendor_name']
const CUSTOMER_REQUIRED_COLUMNS = ['name', 'number']
const COUNTERPARTY_REQUIRED_COLUMNS = ['name', 'phone']
const MAX_DIRECTORY_IMPORT_ROWS = 1000

type OrgContext = { tenant: string; organizationId: string } | null

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

const handleError = (res: Response, error: unknown, fallback: string): void => {
  console.error(error)
  if (error instanceof Error) {
    res.status(400).json({ success: false, message: error.message })
    return
  }
  res.status(500).json({ success: false, message: fallback })
}

const toRequiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`${field} is required.`)
  }
  const normalized = value.trim()
  if (!normalized.length) {
    throw new Error(`${field} is required.`)
  }
  return normalized
}

const toOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  return normalized.length ? normalized : null
}

const resolveVendorLink = async (
  tenant: string,
  organizationId: string,
  vendorId: string | null,
  fallbackName: string | null
): Promise<{ vendor_id: string | null; vendor_name: string | null }> => {
  if (vendorId) {
    const vendor = await getVendorById(tenant, organizationId, vendorId)
    if (!vendor) {
      throw new Error('Vendor not found.')
    }
    return {
      vendor_id: vendor.id,
      vendor_name: vendor.name
    }
  }
  return {
    vendor_id: null,
    vendor_name: fallbackName
  }
}

const customerToCsvRow = (customer: DirectoryCustomer): Record<string, unknown> => ({
  name: customer.name,
  number: customer.number,
  email: customer.email ?? '',
  notes: customer.notes ?? '',
  display_id: customer.display_id,
  created_at: customer.created_at,
  updated_at: customer.updated_at
})

const counterpartyToCsvRow = (counterparty: DirectoryCounterparty): Record<string, unknown> => ({
  name: counterparty.name,
  phone: counterparty.phone,
  role: counterparty.role ?? '',
  email: counterparty.email ?? '',
  context: counterparty.context ?? '',
  vendor_id: counterparty.vendor_id ?? '',
  vendor_name: counterparty.vendor_name ?? '',
  display_id: counterparty.display_id,
  created_at: counterparty.created_at,
  updated_at: counterparty.updated_at
})

const normalizeCustomerCreatePayload = (body: any): DirectoryCustomerCreateInput => ({
  name: toRequiredString(body?.name, 'name'),
  number: toRequiredString(body?.number, 'number'),
  email: toOptionalString(body?.email),
  notes: toOptionalString(body?.notes)
})

const normalizeCustomerUpdatePayload = (body: any): DirectoryCustomerUpdateInput => {
  const updates: DirectoryCustomerUpdateInput = {}
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    updates.name = toRequiredString(body.name, 'name')
  }
  if (Object.prototype.hasOwnProperty.call(body, 'number')) {
    updates.number = toRequiredString(body.number, 'number')
  }
  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    updates.email = toOptionalString(body.email)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    updates.notes = toOptionalString(body.notes)
  }
  return updates
}

const normalizeCounterpartyCreatePayload = async (
  tenant: string,
  organizationId: string,
  body: any
): Promise<DirectoryCounterpartyCreateInput> => {
  const link = await resolveVendorLink(
    tenant,
    organizationId,
    toOptionalString(body?.vendor_id),
    toOptionalString(body?.vendor_name)
  )

  return {
    name: toRequiredString(body?.name, 'name'),
    phone: toRequiredString(body?.phone, 'phone'),
    role: toOptionalString(body?.role),
    email: toOptionalString(body?.email),
    context: toOptionalString(body?.context),
    ...link
  }
}

const normalizeCounterpartyUpdatePayload = async (
  tenant: string,
  organizationId: string,
  body: any
): Promise<DirectoryCounterpartyUpdateInput> => {
  const updates: DirectoryCounterpartyUpdateInput = {}
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    updates.name = toRequiredString(body.name, 'name')
  }
  if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
    updates.phone = toRequiredString(body.phone, 'phone')
  }
  if (Object.prototype.hasOwnProperty.call(body, 'role')) {
    updates.role = toOptionalString(body.role)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    updates.email = toOptionalString(body.email)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'context')) {
    updates.context = toOptionalString(body.context)
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'vendor_id') ||
    Object.prototype.hasOwnProperty.call(body, 'vendor_name')
  ) {
    const link = await resolveVendorLink(
      tenant,
      organizationId,
      toOptionalString(body?.vendor_id),
      toOptionalString(body?.vendor_name)
    )
    updates.vendor_id = link.vendor_id
    updates.vendor_name = link.vendor_name
  }
  return updates
}

const importCustomersFromRows = async (
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
    rows.map(row =>
      limiter(async () => {
        try {
          const payload = normalizeCustomerCreatePayload(row.values)
          await createDirectoryCustomer(tenant, organizationId, payload)
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

const importCounterpartiesFromRows = async (
  tenant: string,
  organizationId: string,
  rows: ParsedSheetRow[]
): Promise<BulkImportSummary> => {
  const limiter = pLimit(2)
  const summary: BulkImportSummary = {
    processed: rows.length,
    created: 0,
    failed: 0,
    errors: []
  }

  await Promise.all(
    rows.map(row =>
      limiter(async () => {
        try {
          const payload = await normalizeCounterpartyCreatePayload(tenant, organizationId, row.values)
          await createDirectoryCounterparty(tenant, organizationId, payload)
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

route.get(
  '/',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    try {
      const [customers, counterparties] = await Promise.all([
        listDirectoryCustomers(context.tenant, context.organizationId),
        listDirectoryCounterparties(context.tenant, context.organizationId)
      ])
      res.json({
        success: true,
        data: {
          customers,
          counterparties
        }
      })
    } catch (error) {
      handleError(res, error, 'Unable to load directory.')
    }
  }
)

route.get(
  '/customers/export',
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
          name: 'North Stand Group',
          number: '+44 7000 000000',
          email: 'ops@example.com',
          notes: 'High-priority customer'
        }
        const csv = buildCsvContent(DIRECTORY_CUSTOMER_TEMPLATE_HEADERS, [templateRow])
        sendCsvResponse(res, 'directory-customers-template.csv', csv)
        return
      }
      const customers = await listDirectoryCustomers(context.tenant, context.organizationId)
      const csv = buildCsvContent(DIRECTORY_CUSTOMER_CSV_HEADERS, customers.map(customerToCsvRow))
      const filename = `directory-customers-${new Date().toISOString().split('T')[0]}.csv`
      sendCsvResponse(res, filename, csv)
    } catch (error) {
      handleError(res, error, 'Unable to export directory customers.')
    }
  }
)

route.post(
  '/customers/import',
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
      const missingColumns = CUSTOMER_REQUIRED_COLUMNS.filter(column => !parsed.columns.includes(column))
      if (missingColumns.length) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`)
      }
      if (!parsed.rows.length) {
        throw new Error('No rows found to import.')
      }
      if (parsed.rows.length > MAX_DIRECTORY_IMPORT_ROWS) {
        throw new Error(`Please limit imports to ${MAX_DIRECTORY_IMPORT_ROWS} rows at a time.`)
      }

      const summary = await importCustomersFromRows(context.tenant, context.organizationId, parsed.rows)
      res.json({ success: true, data: summary })
    } catch (error) {
      handleError(res, error, 'Unable to import directory customers.')
    }
  }
)

route.get(
  '/counterparties/export',
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
          name: 'John Smith',
          phone: '+44 7000 123456',
          role: 'Lead buyer',
          email: 'john@ticketco.com',
          context: 'Prefers WhatsApp updates',
          vendor_name: 'Ticket Supplier LLC'
        }
        const csv = buildCsvContent(DIRECTORY_COUNTERPARTY_TEMPLATE_HEADERS, [templateRow])
        sendCsvResponse(res, 'directory-counterparties-template.csv', csv)
        return
      }
      const counterparties = await listDirectoryCounterparties(context.tenant, context.organizationId)
      const csv = buildCsvContent(
        DIRECTORY_COUNTERPARTY_CSV_HEADERS,
        counterparties.map(counterpartyToCsvRow)
      )
      const filename = `directory-counterparties-${new Date().toISOString().split('T')[0]}.csv`
      sendCsvResponse(res, filename, csv)
    } catch (error) {
      handleError(res, error, 'Unable to export directory counterparties.')
    }
  }
)

route.post(
  '/counterparties/import',
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
      const missingColumns = COUNTERPARTY_REQUIRED_COLUMNS.filter(column =>
        !parsed.columns.includes(column)
      )
      if (missingColumns.length) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`)
      }
      if (!parsed.rows.length) {
        throw new Error('No rows found to import.')
      }
      if (parsed.rows.length > MAX_DIRECTORY_IMPORT_ROWS) {
        throw new Error(`Please limit imports to ${MAX_DIRECTORY_IMPORT_ROWS} rows at a time.`)
      }

      const summary = await importCounterpartiesFromRows(
        context.tenant,
        context.organizationId,
        parsed.rows
      )
      res.json({ success: true, data: summary })
    } catch (error) {
      handleError(res, error, 'Unable to import directory counterparties.')
    }
  }
)

route.post(
  '/customers',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    try {
      const payload = normalizeCustomerCreatePayload(req.body)
      const customer = await createDirectoryCustomer(context.tenant, context.organizationId, payload)
      res.status(201).json({ success: true, data: customer })
    } catch (error) {
      handleError(res, error, 'Unable to create customer entry.')
    }
  }
)

route.put(
  '/customers/:customerId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const customerId = typeof req.params.customerId === 'string' ? req.params.customerId.trim() : ''
    if (!customerId) {
      res.status(400).json({ success: false, message: 'customerId is required.' })
      return
    }

    try {
      const updates = normalizeCustomerUpdatePayload(req.body)
      const customer = await updateDirectoryCustomer(context.tenant, context.organizationId, customerId, updates)
      if (!customer) {
        res.status(404).json({ success: false, message: 'Customer entry not found.' })
        return
      }
      res.json({ success: true, data: customer })
    } catch (error) {
      handleError(res, error, 'Unable to update customer entry.')
    }
  }
)

route.delete(
  '/customers/:customerId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const customerId = typeof req.params.customerId === 'string' ? req.params.customerId.trim() : ''
    if (!customerId) {
      res.status(400).json({ success: false, message: 'customerId is required.' })
      return
    }

    try {
      await deleteDirectoryCustomer(context.tenant, context.organizationId, customerId)
      res.json({ success: true })
    } catch (error) {
      handleError(res, error, 'Unable to delete customer entry.')
    }
  }
)

route.post(
  '/counterparties',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    try {
      const payload = await normalizeCounterpartyCreatePayload(context.tenant, context.organizationId, req.body)
      const counterparty = await createDirectoryCounterparty(
        context.tenant,
        context.organizationId,
        payload
      )
      res.status(201).json({ success: true, data: counterparty })
    } catch (error) {
      handleError(res, error, 'Unable to create counterparty contact.')
    }
  }
)

route.put(
  '/counterparties/:counterpartyId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const counterpartyId =
      typeof req.params.counterpartyId === 'string' ? req.params.counterpartyId.trim() : ''
    if (!counterpartyId) {
      res.status(400).json({ success: false, message: 'counterpartyId is required.' })
      return
    }

    try {
      const updates = await normalizeCounterpartyUpdatePayload(context.tenant, context.organizationId, req.body)
      const counterparty = await updateDirectoryCounterparty(
        context.tenant,
        context.organizationId,
        counterpartyId,
        updates
      )
      if (!counterparty) {
        res.status(404).json({ success: false, message: 'Counterparty not found.' })
        return
      }
      res.json({ success: true, data: counterparty })
    } catch (error) {
      handleError(res, error, 'Unable to update counterparty contact.')
    }
  }
)

route.delete(
  '/counterparties/:counterpartyId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const counterpartyId =
      typeof req.params.counterpartyId === 'string' ? req.params.counterpartyId.trim() : ''
    if (!counterpartyId) {
      res.status(400).json({ success: false, message: 'counterpartyId is required.' })
      return
    }

    try {
      await deleteDirectoryCounterparty(context.tenant, context.organizationId, counterpartyId)
      res.json({ success: true })
    } catch (error) {
      handleError(res, error, 'Unable to delete counterparty contact.')
    }
  }
)

export = route
