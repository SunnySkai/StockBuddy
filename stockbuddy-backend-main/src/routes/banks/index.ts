import express, { Response } from 'express'
import type { Express } from 'express'
import multer from 'multer'
import pLimit from 'p-limit'
import { requireLoggedInUser } from '../../decorators/require_param'
import { AuthenticatedRequest, Request } from '../../models/request'
import { createBank, deleteBank, listBanks, updateBank } from '../../daos/banks'
import { BankAccount, BankAccountCreateInput, BankAccountUpdateInput } from '../../models/bank'
import { buildCsvContent, parseSpreadsheet, type ParsedSheetRow } from '../../helpers/spreadsheet'
import type { BulkImportSummary } from '../../models/bulk_import'

const route = express.Router()

const sendCsvResponse = (res: Response, filename: string, csv: string): void => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(`${CSV_BOM}${csv}`)
}

const bankToCsvRow = (bank: BankAccount): Record<string, unknown> => ({
  name: bank.name,
  balance: bank.balance
})

const importBanksFromRows = async (
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
          await createBank(tenant, organizationId, payload)
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
  limits: { fileSize: 5 * 1024 * 1024 }
})
const CSV_BOM = '\ufeff'
const BANK_CSV_HEADERS = ['name', 'balance']
const BANK_TEMPLATE_HEADERS = ['name', 'balance']
const BANK_REQUIRED_COLUMNS = ['name']
const MAX_BANK_IMPORT_ROWS = 1000

type OrgContext =
  | { tenant: string; organizationId: string }
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
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}

const toName = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const normalizeCreatePayload = (body: unknown): BankAccountCreateInput => {
  if (!body || typeof body !== 'object') {
    throw new Error('Payload must be an object.')
  }
  const payload = body as Record<string, unknown>
  const name = toName(payload.name ?? payload.accountName)
  if (!name) {
    throw new Error('Account name is required.')
  }
  return {
    name,
    balance: toNumber(payload.balance)
  }
}

const normalizeUpdatePayload = (body: unknown): BankAccountUpdateInput => {
  if (!body || typeof body !== 'object') {
    throw new Error('Payload must be an object.')
  }
  const payload = body as Record<string, unknown>
  const updates: BankAccountUpdateInput = {}

  if (Object.prototype.hasOwnProperty.call(payload, 'name') || Object.prototype.hasOwnProperty.call(payload, 'accountName')) {
    const name = toName(payload.name ?? payload.accountName)
    if (!name) {
      throw new Error('Account name cannot be empty.')
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
          name: 'Operating Account',
          balance: 10000
        }
        const csv = buildCsvContent(BANK_TEMPLATE_HEADERS, [templateRow])
        sendCsvResponse(res, 'bank-accounts-template.csv', csv)
        return
      }
      const banks = await listBanks(context.tenant, context.organizationId)
      const csv = buildCsvContent(BANK_CSV_HEADERS, banks.map(bankToCsvRow))
      const filename = `bank-accounts-${new Date().toISOString().split('T')[0]}.csv`
      sendCsvResponse(res, filename, csv)
    } catch (error) {
      handleError(res, error, 'Unable to export bank accounts.')
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
      const missingColumns = BANK_REQUIRED_COLUMNS.filter(
        (column) => !parsed.columns.includes(column)
      )
      if (missingColumns.length) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`)
      }
      if (!parsed.rows.length) {
        throw new Error('No rows found to import.')
      }
      if (parsed.rows.length > MAX_BANK_IMPORT_ROWS) {
        throw new Error(`Please limit imports to ${MAX_BANK_IMPORT_ROWS} rows at a time.`)
      }

      const summary = await importBanksFromRows(
        context.tenant,
        context.organizationId,
        parsed.rows
      )
      res.json({ success: true, data: summary })
    } catch (error) {
      handleError(res, error, 'Unable to import bank accounts.')
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
      const banks = await listBanks(context.tenant, context.organizationId, { search })
      res.json({ success: true, data: banks })
    } catch (error) {
      handleError(res, error, 'Unable to load bank accounts.')
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
      const bank = await createBank(context.tenant, context.organizationId, input)
      res.status(201).json({ success: true, data: bank })
    } catch (error) {
      handleError(res, error, 'Unable to create bank account.')
    }
  }
)

route.put(
  '/:bankId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const bankId = typeof req.params.bankId === 'string' ? req.params.bankId.trim() : ''
    if (!bankId) {
      res.status(400).json({ success: false, message: 'bankId is required.' })
      return
    }

    try {
      const updates = normalizeUpdatePayload(req.body)
      const bank = await updateBank(context.tenant, context.organizationId, bankId, updates)
      if (!bank) {
        res.status(404).json({ success: false, message: 'Bank account not found.' })
        return
      }
      res.json({ success: true, data: bank })
    } catch (error) {
      handleError(res, error, 'Unable to update bank account.')
    }
  }
)

route.delete(
  '/:bankId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    const bankId = typeof req.params.bankId === 'string' ? req.params.bankId.trim() : ''
    if (!bankId) {
      res.status(400).json({ success: false, message: 'bankId is required.' })
      return
    }

    try {
      await deleteBank(context.tenant, context.organizationId, bankId)
      res.json({ success: true })
    } catch (error) {
      handleError(res, error, 'Unable to delete bank account.')
    }
  }
)

export = route
