import express, { Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireLoggedInUser } from '../../decorators/require_param'
import { AuthenticatedRequest, Request } from '../../models/request'
import {
  createTransaction,
  getTransactionById,
  listTransactions,
  setTransactionStatus,
  TransactionFilters
} from '../../daos/transactions'
import { adjustVendorBalance, getVendorById } from '../../daos/vendors'
import { adjustBankBalance, getBankById } from '../../daos/banks'
import {
  ManualTransactionDirection,
  ManualTransactionMode,
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType
} from '../../models/transaction'
import {
  OUTSTANDING_EPSILON,
  buildTransactionSummary,
  getOutstandingAmount,
  getSettledAmount,
  roundCurrency,
  toTransactionView
} from '../../services/transaction_view'
import type { Vendor } from '../../models/vendor'

const route = express.Router()

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
  return {
    tenant: req.tenant ?? '',
    organizationId: user.organization_id,
    userId: user.id
  }
}

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

const toPositiveNumber = (value: unknown, label: string): number => {
  const normalized = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(`${label} must be a positive number.`)
  }
  return normalized
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

const isTransactionStatusValue = (value: string): value is TransactionStatus =>
  ['Pending', 'Partial', 'Paid', 'Cancelled'].includes(value as TransactionStatus)

const isTransactionTypeValue = (value: string): value is TransactionType =>
  ['purchase', 'order', 'sale', 'membership', 'manual'].includes(value as TransactionType)

const isTransactionCategoryValue = (value: string): value is TransactionCategory =>
  [
    'ticket_purchase',
    'ticket_sale',
    'ticket_order',
    'membership',
    'shipping',
    'ai_bot',
    'salary',
    'internal',
    'journal_voucher',
    'other'
  ].includes(value as TransactionCategory)

const isManualDirectionValue = (value: string): value is ManualTransactionDirection =>
  value === 'in' || value === 'out'

const isManualModeValue = (value: string): value is ManualTransactionMode =>
  value === 'standard' || value === 'journal_voucher'

const parseFilters = (query: Record<string, unknown>): TransactionFilters => {
  const filters: TransactionFilters = {}
  const vendorId = toOptionalString(query.vendor_id ?? query.vendorId)
  if (vendorId) {
    filters.vendor_id = vendorId
  }
  const status = toOptionalString(query.status)
  if (status && isTransactionStatusValue(status)) {
    filters.status = status
  }
  const type = toOptionalString(query.type)
  if (type && isTransactionTypeValue(type)) {
    filters.type = type
  }
  const startDate = toOptionalString(query.start_date ?? query.startDate)
  if (startDate) {
    filters.start_date = startDate
  }
  const endDate = toOptionalString(query.end_date ?? query.endDate)
  if (endDate) {
    filters.end_date = endDate
  }
  return filters
}

type ManualTransactionPayload = {
  vendor_id: string
  type: TransactionType
  amount: number
  category: TransactionCategory
  direction: ManualTransactionDirection
  mode: ManualTransactionMode
  notes?: string | null
  attachments?: string[]
  journal_vendor_id?: string | null
  bank_account_id?: string | null
}

const normalizeManualPayload = (body: Record<string, unknown>): ManualTransactionPayload => {
  const type = toRequiredString(body.type ?? body.transaction_type ?? body.transactionType, 'type')
  if (!isTransactionTypeValue(type)) {
    throw new Error('Unsupported transaction type.')
  }
  if (type !== 'manual') {
    throw new Error('Manual transactions must use the manual type.')
  }
  const directionInput = toOptionalString(
    body.direction ?? body.flow_direction ?? body.flowDirection ?? body.payment_direction ?? body.paymentDirection
  )
  const modeInput = toOptionalString(body.mode ?? body.entry_type ?? body.entryType)
  let mode: ManualTransactionMode = 'standard'
  if (modeInput) {
    const normalized = modeInput.toLowerCase()
    if (!isManualModeValue(normalized)) {
      throw new Error('Unsupported manual transaction mode.')
    }
    mode = normalized
  }
  let direction: ManualTransactionDirection = 'out'
  if (directionInput) {
    const normalized = directionInput.toLowerCase()
    if (!isManualDirectionValue(normalized)) {
      throw new Error('direction must be either "in" or "out".')
    }
    direction = normalized
  }
  if (mode === 'journal_voucher') {
    direction = 'out'
  }
  const rawBankAccountId = toOptionalString(
    body.bank_account_id ?? body.bankAccountId ?? body.bank_id ?? body.bankId
  )
  if (mode !== 'journal_voucher' && !rawBankAccountId) {
    throw new Error('bank_account_id is required for manual payments.')
  }
  const rawCategory = toOptionalString(body.category ?? body.transaction_category ?? body.transactionCategory)
  let categoryValue: TransactionCategory
  if (mode === 'journal_voucher') {
    categoryValue = 'journal_voucher'
  } else {
    if (!rawCategory) {
      throw new Error('category is required.')
    }
    if (!isTransactionCategoryValue(rawCategory)) {
      throw new Error('Invalid transaction category.')
    }
    if (rawCategory === 'journal_voucher') {
      throw new Error('Select the journal voucher entry type to use the journal voucher category.')
    }
    categoryValue = rawCategory
  }
  const payload: ManualTransactionPayload = {
    vendor_id: toRequiredString(body.vendor_id ?? body.vendorId, 'vendor_id'),
    type,
    amount: toPositiveNumber(body.amount, 'amount'),
    category: categoryValue,
    direction,
    mode,
    bank_account_id: mode === 'journal_voucher' ? null : rawBankAccountId ?? null
  }
  if (mode === 'journal_voucher') {
    const journalId = toRequiredString(
      body.journal_vendor_id ?? body.journalVendorId ?? body.covered_by_vendor_id ?? body.coveredByVendorId,
      'journal_vendor_id'
    )
    if (journalId === payload.vendor_id) {
      throw new Error('journal_vendor_id must be different from vendor_id.')
    }
    payload.journal_vendor_id = journalId
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    const notesValue = typeof body.notes === 'string' ? body.notes.trim() : ''
    payload.notes = notesValue.length ? notesValue : null
  }
  if (Array.isArray(body.attachments)) {
    payload.attachments = body.attachments
      .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(entry => Boolean(entry))
  }
  return payload
}

const ensureVendorExists = async (
  tenant: string,
  organizationId: string,
  vendorId: string
): Promise<Vendor> => {
  const vendor = await getVendorById(tenant, organizationId, vendorId)
  if (!vendor) {
    throw new Error('Vendor not found.')
  }
  return vendor
}

const ensureBankExists = async (
  tenant: string,
  organizationId: string,
  bankId: string
): Promise<void> => {
  const bank = await getBankById(tenant, organizationId, bankId)
  if (!bank) {
    throw new Error('Bank account not found.')
  }
}

const transactionDirection = (transaction: Transaction): 1 | -1 => {
  if (transaction.manual_direction === 'in') {
    return -1
  }
  if (transaction.manual_direction === 'out') {
    return 1
  }
  if (transaction.type === 'order' || transaction.type === 'sale') {
    return -1
  }
  return 1
}

const calculateVendorBalanceDelta = (
  previous: Transaction,
  next: Transaction | null
): number => {
  if (!next || !next.vendor_id) {
    return 0
  }
  const prevPaidAmount = getSettledAmount(previous)
  const nextPaidAmount = getSettledAmount(next)
  const delta = nextPaidAmount - prevPaidAmount
  if (!Number.isFinite(delta) || delta === 0) {
    return 0
  }
  const direction = transactionDirection(next)
  return direction * delta
}

const calculateBankBalanceDelta = (
  previous: Transaction,
  next: Transaction | null
): number => {
  const reference = next ?? previous
  if (!reference) {
    return 0
  }
  const prevPaidAmount = getSettledAmount(previous)
  const nextPaidAmount = getSettledAmount(next)
  const delta = nextPaidAmount - prevPaidAmount
  if (!Number.isFinite(delta) || delta === 0) {
    return 0
  }
  const direction = transactionDirection(reference)
  return -direction * delta
}

const describeJournalVoucher = (payee: Vendor, covering: Vendor): string => {
  const payeeName = payee.name || 'the vendor'
  const coveringName = covering.name || 'the counterparty'
  return `Payment to ${payeeName} was made by ${coveringName} on behalf of your organization. ${coveringName} owed you money, so this payment has been adjusted against their balance. No cash or bank payment was recorded.`
}

const appendNotes = (base: string, extra?: string | null): string => {
  if (extra && extra.trim().length) {
    return `${base}\n\n${extra.trim()}`
  }
  return base
}

const settleManualTransaction = async (
  context: OrgContext,
  transaction: Transaction
): Promise<Transaction> => {
  if (!context) {
    throw new Error('Missing organization context.')
  }
  await setTransactionStatus(context.tenant, context.organizationId, transaction.transaction_id, 'Paid', context.userId, {
    bankAccountId: null
  })
  const updated = await getTransactionById(context.tenant, context.organizationId, transaction.transaction_id)
  if (updated) {
    const vendorDelta = calculateVendorBalanceDelta(transaction, updated)
    if (updated.vendor_id && vendorDelta !== 0) {
      await adjustVendorBalance(context.tenant, context.organizationId, updated.vendor_id, vendorDelta)
    }
  }
  return updated ?? transaction
}

const createJournalVoucherTransactions = async (
  context: OrgContext,
  payload: ManualTransactionPayload & { journal_vendor_id: string },
  payeeVendor: Vendor,
  coveringVendor: Vendor
): Promise<Transaction> => {
  if (!context) {
    throw new Error('Missing organization context.')
  }
  const referenceId = uuidv4()
  const summary = describeJournalVoucher(payeeVendor, coveringVendor)
  const payeeNotes = appendNotes(summary, payload.notes)
  const coveringNotes = appendNotes(
    `Journal voucher adjustment recorded for ${coveringVendor.name || 'counterparty'} covering ${payeeVendor.name || 'vendor'}.`,
    payload.notes
  )
  const attachments = payload.attachments
  const payeePending = await createTransaction(context.tenant, context.organizationId, {
    vendorId: payload.vendor_id,
    type: payload.type,
    recordType: 'manual',
    amount: payload.amount,
    notes: payeeNotes,
    attachments,
    category: payload.category,
    action: 'create_manual',
    createdByUserId: context.userId,
    manualDirection: 'out',
    manualMode: 'journal_voucher',
    journalVendorId: coveringVendor.id,
    manualReferenceId: referenceId
  })
  const coveringPending = await createTransaction(context.tenant, context.organizationId, {
    vendorId: payload.journal_vendor_id,
    type: payload.type,
    recordType: 'manual',
    amount: payload.amount,
    notes: coveringNotes,
    attachments,
    category: payload.category,
    action: 'create_manual',
    createdByUserId: context.userId,
    manualDirection: 'in',
    manualMode: 'journal_voucher',
    journalVendorId: payeeVendor.id,
    manualReferenceId: referenceId
  })
  const settledPayee = await settleManualTransaction(context, payeePending)
  await settleManualTransaction(context, coveringPending)
  return settledPayee
}

route.get(
  '/',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return

    try {
      const filters = parseFilters(req.query as Record<string, unknown>)
      const transactionsRaw = await listTransactions(context.tenant, context.organizationId, filters)
      const transactions = transactionsRaw.map(toTransactionView)
      const summary = buildTransactionSummary(transactions)
      res.json({ success: true, data: { transactions, summary } })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load transactions.'
      res.status(400).json({ success: false, message })
    }
  }
)

route.post(
  '/manual',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return
    try {
      if (!req.body || typeof req.body !== 'object') {
        throw new Error('Payload required.')
      }
      const payload = normalizeManualPayload(req.body as Record<string, unknown>)
      const vendor = await ensureVendorExists(context.tenant, context.organizationId, payload.vendor_id)
      let bankAccountId: string | null = null
      if (payload.mode !== 'journal_voucher') {
        const requestedBankId = payload.bank_account_id ?? null
        if (!requestedBankId) {
          throw new Error('bank_account_id is required for manual payments.')
        }
        const bank = await getBankById(context.tenant, context.organizationId, requestedBankId)
        if (!bank) {
          throw new Error('Bank account not found.')
        }
        bankAccountId = bank.id
      }
      if (payload.mode === 'journal_voucher') {
        if (!payload.journal_vendor_id) {
          throw new Error('journal_vendor_id is required for journal vouchers.')
        }
        const coveringVendor = await ensureVendorExists(
          context.tenant,
          context.organizationId,
          payload.journal_vendor_id
        )
        const created = await createJournalVoucherTransactions(
          context,
          payload as ManualTransactionPayload & { journal_vendor_id: string },
          vendor,
          coveringVendor
        )
        res.status(201).json({ success: true, data: toTransactionView(created) })
        return
      }
      const created = await createTransaction(context.tenant, context.organizationId, {
        vendorId: payload.vendor_id,
        type: payload.type,
        recordType: 'manual',
        amount: payload.amount,
        notes: payload.notes ?? null,
        attachments: payload.attachments,
        category: payload.category,
        action: 'create_manual',
        createdByUserId: context.userId,
        manualDirection: payload.direction,
        manualMode: payload.mode,
        journalVendorId: payload.journal_vendor_id ?? null,
        bankAccountId
      })
      res.status(201).json({ success: true, data: toTransactionView(created) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create manual transaction.'
      res.status(400).json({ success: false, message })
    }
  }
)

const handleStatusChange = async (
  req: Request,
  res: Response,
  status: TransactionStatus
): Promise<void> => {
  const context = ensureOrgContext(req, res)
  if (!context) return
  const transactionId = typeof req.params.transactionId === 'string' ? req.params.transactionId.trim() : ''
  if (!transactionId.length) {
    res.status(400).json({ success: false, message: 'transactionId is required.' })
    return
  }

  try {
    const existing = await getTransactionById(context.tenant, context.organizationId, transactionId)
    if (!existing) {
      res.status(404).json({ success: false, message: 'Transaction not found.' })
      return
    }
    if (status === 'Paid') {
      if (existing.status === 'Paid') {
        res.status(400).json({ success: false, message: 'Transaction is already paid.' })
        return
      }
      if (existing.status === 'Cancelled') {
        res.status(400).json({ success: false, message: 'Cancelled transactions cannot be paid.' })
        return
      }
      if (existing.status !== 'Pending' && existing.status !== 'Partial') {
        res
          .status(400)
          .json({ success: false, message: 'Only pending or partial transactions can be paid.' })
        return
      }
      if (getOutstandingAmount(existing) <= 0) {
        res.status(400).json({ success: false, message: 'Transaction is already settled.' })
        return
      }
    }
    if (status === 'Cancelled' && existing.status === 'Cancelled') {
      res.status(400).json({ success: false, message: 'Transaction is already cancelled.' })
      return
    }
    let bankAccountId: string | null = null
    if (status === 'Paid') {
      bankAccountId =
        typeof req.body?.bank_account_id === 'string' ? req.body.bank_account_id.trim() : ''
      if (!bankAccountId) {
        res.status(400).json({ success: false, message: 'bank_account_id is required to settle payments.' })
        return
      }
      await ensureBankExists(context.tenant, context.organizationId, bankAccountId)
      if (getSettledAmount(existing) > 0 && existing.bank_account_id && existing.bank_account_id !== bankAccountId) {
        res.status(400).json({
          success: false,
          message: 'Additional payments must use the same bank account as previous payments.'
        })
        return
      }
    }
    const targetBankId = status === 'Paid' ? bankAccountId : existing.bank_account_id ?? null
    await setTransactionStatus(
      context.tenant,
      context.organizationId,
      transactionId,
      status,
      context.userId,
      { bankAccountId: status === 'Paid' ? bankAccountId : null }
    )
    const updated = await getTransactionById(context.tenant, context.organizationId, transactionId)
    const vendorDelta = calculateVendorBalanceDelta(existing, updated)
    if (updated?.vendor_id && vendorDelta !== 0) {
      await adjustVendorBalance(context.tenant, context.organizationId, updated.vendor_id, vendorDelta)
    }
    const bankDelta = calculateBankBalanceDelta(existing, updated)
    if (targetBankId && bankDelta !== 0) {
      await adjustBankBalance(context.tenant, context.organizationId, targetBankId, bankDelta)
    }
    res.json({ success: true, data: updated ? toTransactionView(updated) : null })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update transaction.'
    res.status(400).json({ success: false, message })
  }
}

route.post(
  '/:transactionId/partial-payment',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) return
    const transactionId = typeof req.params.transactionId === 'string' ? req.params.transactionId.trim() : ''
    if (!transactionId.length) {
      res.status(400).json({ success: false, message: 'transactionId is required.' })
      return
    }
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ success: false, message: 'Payload required.' })
      return
    }
    try {
      const payload = req.body as Record<string, unknown>
      const amount = toPositiveNumber(payload.amount, 'amount')
      const bankAccountId = toRequiredString(
        payload.bank_account_id ?? payload.bankAccountId,
        'bank_account_id'
      )
      const existing = await getTransactionById(context.tenant, context.organizationId, transactionId)
      if (!existing) {
        res.status(404).json({ success: false, message: 'Transaction not found.' })
        return
      }
      if (existing.status === 'Cancelled') {
        res.status(400).json({ success: false, message: 'Cancelled transactions cannot accept payments.' })
        return
      }
      if (existing.status === 'Paid') {
        res.status(400).json({ success: false, message: 'Transaction is already paid.' })
        return
      }
      if (existing.status !== 'Pending' && existing.status !== 'Partial') {
        res.status(400).json({ success: false, message: 'Only pending or partial transactions can be paid.' })
        return
      }
      const outstanding = getOutstandingAmount(existing)
      if (outstanding <= 0) {
        res.status(400).json({ success: false, message: 'Transaction is already settled.' })
        return
      }
      if (amount > outstanding) {
        res
          .status(400)
          .json({ success: false, message: `Amount exceeds outstanding balance of ${outstanding}.` })
        return
      }
      const currentPaid = getSettledAmount(existing)
      if (currentPaid > 0 && existing.bank_account_id && existing.bank_account_id !== bankAccountId) {
        res.status(400).json({
          success: false,
          message: 'All payments for a transaction must use the same bank account.'
        })
        return
      }
      await ensureBankExists(context.tenant, context.organizationId, bankAccountId)
      const paidTotal = Math.min(existing.amount, currentPaid + amount)
      const nextPaid = roundCurrency(paidTotal)
      const owedTotal = Math.max(existing.amount - nextPaid, 0)
      const roundedOwed = roundCurrency(owedTotal)
      const isSettled = roundedOwed <= OUTSTANDING_EPSILON
      const nextStatus: TransactionStatus = isSettled ? 'Paid' : 'Partial'
      const normalizedOwed = isSettled ? 0 : roundedOwed
      if (nextStatus === 'Partial') {
        await setTransactionStatus(context.tenant, context.organizationId, transactionId, 'Partial', context.userId, {
          bankAccountId,
          amountPaid: nextPaid,
          amountOwed: normalizedOwed
        })
      } else {
        await setTransactionStatus(
          context.tenant,
          context.organizationId,
          transactionId,
          'Paid',
          context.userId,
          { bankAccountId }
        )
      }
      const updated = await getTransactionById(context.tenant, context.organizationId, transactionId)
      const vendorDelta = calculateVendorBalanceDelta(existing, updated)
      if (updated?.vendor_id && vendorDelta !== 0) {
        await adjustVendorBalance(context.tenant, context.organizationId, updated.vendor_id, vendorDelta)
      }
      const bankDelta = calculateBankBalanceDelta(existing, updated)
      if (bankDelta !== 0) {
        await adjustBankBalance(context.tenant, context.organizationId, bankAccountId, bankDelta)
      }
      res.json({ success: true, data: updated ? toTransactionView(updated) : null })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to record payment.'
      res.status(400).json({ success: false, message })
    }
  }
)

route.post('/:transactionId/mark-paid', requireLoggedInUser(), (req, res) =>
  handleStatusChange(req, res, 'Paid')
)

route.post('/:transactionId/cancel', requireLoggedInUser(), (req, res) =>
  handleStatusChange(req, res, 'Cancelled')
)

export = route
