import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCcw, CheckCircle2, Ban, Loader2, X, CreditCard, FileText, Download } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import LoadingScreen from '../components/LoadingScreen'
import { useSession } from '../context/SessionContext'
import { useCurrency } from '../context/CurrencyContext'
import {
  cancelTransaction,
  createManualTransaction,
  fetchTransactions,
  markTransactionPaid,
  recordTransactionPayment
} from '../api/transactions'
import { fetchVendors } from '../api/vendors'
import { fetchBanks } from '../api/banks'
import type {
  ManualTransactionDirection,
  ManualTransactionMode,
  ManualTransactionPayload,
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionSummary
} from '../types/transactions'
import type { VendorRecord } from '../types/vendors'
import type { BankRecord } from '../types/banks'
import { TRANSACTION_CATEGORIES, getSignedAmount } from '../constants/transactions'

const PAGE_SIZE = 40

type Filters = {
  vendor_id: string
  status: string
  type: string
  start_date: string
  end_date: string
}

type ManualTransactionForm = {
  mode: ManualTransactionMode
  vendor_id: string
  journal_vendor_id: string
  amount: string
  category: TransactionCategory
  direction: ManualTransactionDirection
  notes: string
  attachments: string
  bank_id: string
}

type ManualFormChangeHandler = <K extends keyof ManualTransactionForm>(
  field: K,
  value: ManualTransactionForm[K]
) => void

const createSummarySnapshot = (): TransactionSummary => ({
  total: 0,
  paid: 0,
  pending: 0,
  partial: 0,
  cancelled: 0,
  owed: 0
})

const defaultSummary: TransactionSummary = createSummarySnapshot()

const manualExcludedCategories: TransactionCategory[] = [
  'ticket_purchase',
  'ticket_sale',
  'ticket_order',
  'membership'
]

const JOURNAL_CATEGORY: TransactionCategory = 'journal_voucher'

const TransactionsPage = () => {
  const { status: authStatus, token } = useSession()
  const { formatCurrency, convertToBase, convertFromBase } = useCurrency()
  const [vendors, setVendors] = useState<VendorRecord[]>([])
  const [filters, setFilters] = useState<Filters>({
    vendor_id: '',
    status: '',
    type: '',
    start_date: '',
    end_date: ''
  })
  const [refreshKey, setRefreshKey] = useState(0)
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; transactions: Transaction[]; summary: TransactionSummary }
  >({ status: 'loading' })
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [bulkAction, setBulkAction] = useState<'paid' | 'cancel' | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const manualCategories = TRANSACTION_CATEGORIES.filter(category => !manualExcludedCategories.includes(category))
  const defaultManualCategory =
    manualCategories.find(category => category !== JOURNAL_CATEGORY) ??
    manualCategories[0] ??
    TRANSACTION_CATEGORIES.find(category => !manualExcludedCategories.includes(category)) ??
    TRANSACTION_CATEGORIES[0]

  const [manualForm, setManualForm] = useState<ManualTransactionForm>({
    mode: 'standard',
    vendor_id: '',
    journal_vendor_id: '',
    amount: '',
    category: defaultManualCategory,
    direction: 'out',
    notes: '',
    attachments: '',
    bank_id: ''
  })
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [banks, setBanks] = useState<BankRecord[]>([])
  const [banksLoading, setBanksLoading] = useState(false)
  const [bulkPaymentModalOpen, setBulkPaymentModalOpen] = useState(false)
  const [bulkBankId, setBulkBankId] = useState('')
  const [paymentModal, setPaymentModal] = useState<{
    transaction: Transaction
    amount: string
    bankId: string
  } | null>(null)
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  useEffect(() => {
    if (banks.length && !manualForm.bank_id) {
      setManualForm(prev => ({ ...prev, bank_id: prev.bank_id || banks[0].id }))
    }
  }, [banks, manualForm.bank_id])
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [invoiceModal, setInvoiceModal] = useState<{ transaction: Transaction } | null>(null)

  const loadBanks = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) return
      if (!options?.silent) {
        setBanksLoading(true)
      }
      try {
        const result = await fetchBanks(token)
        if (result.ok) {
          setBanks(result.data.data)
        } else if (!options?.silent) {
          setBulkError(result.error)
        }
      } catch (error) {
        if (!options?.silent) {
          const message = error instanceof Error ? error.message : 'Unable to load bank accounts.'
          setBulkError(message)
        }
      } finally {
        if (!options?.silent) {
          setBanksLoading(false)
        }
      }
    },
    [token]
  )

  const applyTransactionUpdate = useCallback((updated: Transaction | null | undefined) => {
    if (!updated) return
    setState(prev => {
      if (prev.status !== 'ready') {
        return prev
      }
      const exists = prev.transactions.some(tx => tx.transaction_id === updated.transaction_id)
      if (!exists) {
        return prev
      }
      const nextTransactions = prev.transactions.map(tx =>
        tx.transaction_id === updated.transaction_id ? updated : tx
      )
      return {
        ...prev,
        transactions: nextTransactions,
        summary: summarizeTransactions(nextTransactions)
      }
    })
  }, [])

  useEffect(() => {
    if (!token) return
    fetchVendors(token).then(result => {
      if (result.ok) {
        setVendors(result.data.data.vendors)
      }
    })
  }, [token])

  useEffect(() => {
    setCurrentPage(1)
  }, [filters.vendor_id, filters.status, filters.type, filters.start_date, filters.end_date])

  useEffect(() => {
    loadBanks()
  }, [loadBanks])

  useEffect(() => {
    if (!token) return
    setState({ status: 'loading' })
    fetchTransactions(token, sanitizeFilters(filters))
      .then(result => {
        if (!result.ok) {
          setState({ status: 'error', message: result.error })
          return
        }
        const payload = result.data.data
        const transactions = (payload.transactions ?? [])
          .filter(transaction => transaction.type !== 'sale')
        const summarySnapshot = payload.summary ?? defaultSummary
        setState({
          status: 'ready',
          transactions,
          summary: summarySnapshot
        })
        setSelected({})
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : 'Unable to load transactions.'
        setState({ status: 'error', message })
      })
  }, [filters, refreshKey, token])

  const transactions: Transaction[] = state.status === 'ready' ? state.transactions : []
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE))
    setCurrentPage(prev => Math.min(prev, maxPage))
  }, [transactions.length])
  const summary = state.status === 'ready' ? state.summary : defaultSummary
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const endIndex = startIndex + PAGE_SIZE
  const paginatedTransactions = transactions.slice(startIndex, endIndex)
  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE))
  const showingFrom = transactions.length === 0 ? 0 : startIndex + 1
  const showingTo = Math.min(endIndex, transactions.length)
  const goToPrevPage = () => setCurrentPage(prev => Math.max(1, prev - 1))
  const goToNextPage = () => setCurrentPage(prev => Math.min(totalPages, prev + 1))
  const selectedTransactions = useMemo(
    () => transactions.filter(transaction => selected[transaction.transaction_id]),
    [transactions, selected]
  )
  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, value]) => value).map(([id]) => id),
    [selected]
  )
  const allVisibleSelected =
    paginatedTransactions.length > 0 &&
    paginatedTransactions.every(transaction => selected[transaction.transaction_id])
  const someVisibleSelected = paginatedTransactions.some(transaction => selected[transaction.transaction_id])
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = !allVisibleSelected && someVisibleSelected
    }
  }, [allVisibleSelected, someVisibleSelected])
  const selectionHasInvalidPayment = useMemo(
    () => selectedTransactions.some(transaction => !isTransactionPayable(transaction)),
    [selectedTransactions]
  )

  const toggleSelection = (transactionId: string) => {
    setSelected(prev => ({
      ...prev,
      [transactionId]: !prev[transactionId]
    }))
  }

  const toggleSelectAll = (checked: boolean) => {
    setSelected(prev => {
      const next = { ...prev }
      paginatedTransactions.forEach(transaction => {
        if (checked) {
          next[transaction.transaction_id] = true
        } else {
          delete next[transaction.transaction_id]
        }
      })
      return next
    })
  }

  const performBulkAction = async (action: 'paid' | 'cancel', bankAccountId?: string) => {
    if (!token || !selectedIds.length) return
    if (action === 'paid' && !bankAccountId) {
      setBulkError('Select a bank or wallet to settle these transactions.')
      return
    }
    if (action === 'paid' && selectionHasInvalidPayment) {
      setBulkError('Only pending or partial transactions with an outstanding balance can be settled.')
      return
    }
    setBulkAction(action)
    setBulkError(null)
    try {
      for (const id of selectedIds) {
        const result =
          action === 'paid'
            ? await markTransactionPaid(token, id, bankAccountId as string)
            : await cancelTransaction(token, id)
        if (!result.ok) {
          throw new Error(result.error)
        }
        applyTransactionUpdate(result.data.data)
      }
      setSelected({})
      if (action === 'paid') {
        loadBanks({ silent: true })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update selected transactions.'
      setBulkError(message)
    } finally {
      setBulkAction(null)
    }
  }

  const handleManualFieldChange: ManualFormChangeHandler = (field, value) => {
    setManualForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'mode') {
        if (value === 'journal_voucher') {
          next.category = JOURNAL_CATEGORY
          next.direction = 'out'
        } else if (prev.category === JOURNAL_CATEGORY) {
          next.category = defaultManualCategory
        }
      }
      return next
    })
  }

  const closeManualModal = () => {
    setManualModalOpen(false)
    setManualError(null)
    setManualForm(prev => ({
      ...prev,
      mode: 'standard',
      vendor_id: '',
      journal_vendor_id: '',
      amount: '',
      direction: 'out',
      notes: '',
      attachments: '',
      category: defaultManualCategory,
      bank_id: banks[0]?.id ?? ''
    }))
  }

  const handleManualSubmit = async () => {
    if (!token) return
    const isJournal = manualForm.mode === 'journal_voucher'
    if (!manualForm.vendor_id.trim()) {
      setManualError(isJournal ? 'Payee is required.' : 'CounterParty is required.')
      return
    }
    if (isJournal) {
      if (!manualForm.journal_vendor_id.trim()) {
        setManualError('Select who is covering the payment.')
        return
      }
      if (manualForm.journal_vendor_id === manualForm.vendor_id) {
        setManualError('Payee and covering vendor must be different.')
        return
      }
    }
    if (!manualForm.amount.trim()) {
      setManualError('Amount is required.')
      return
    }
    const amount = convertToBase(Number(manualForm.amount))
    if (!Number.isFinite(amount) || amount <= 0) {
      setManualError('Enter a valid amount.')
      return
    }
    if (!isJournal && !manualForm.bank_id) {
      setManualError('Select a bank or wallet.')
      return
    }
    setManualSaving(true)
    setManualError(null)
    const attachments = manualForm.attachments
      .split('\n')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0)
    const payload: ManualTransactionPayload = {
      vendor_id: manualForm.vendor_id,
      type: 'manual' as const,
      amount,
      category: isJournal ? JOURNAL_CATEGORY : manualForm.category,
      direction: isJournal ? 'out' : manualForm.direction,
      mode: manualForm.mode,
      notes: manualForm.notes.trim() ? manualForm.notes.trim() : null,
      attachments: attachments.length ? attachments : undefined,
      bank_account_id: isJournal ? null : manualForm.bank_id
    }
    if (isJournal) {
      payload.journal_vendor_id = manualForm.journal_vendor_id
    }
    const result = await createManualTransaction(token, payload)
    if (!result.ok) {
      setManualError(result.error)
      setManualSaving(false)
      return
    }
    setManualSaving(false)
    closeManualModal()
    setRefreshKey(value => value + 1)
    loadBanks({ silent: true })
  }

  const openPaymentModal = (transaction: Transaction) => {
    if (!banks.length) {
      setBulkError('Add a bank or wallet before recording a payment.')
      return
    }
    const outstanding = getTransactionOutstanding(transaction)
    setPaymentModal({
      transaction,
      amount: outstanding > 0 ? convertFromBase(outstanding).toFixed(2) : '',
      bankId: transaction.bank_account_id ?? banks[0]?.id ?? ''
    })
    setPaymentError(null)
  }

  const closePaymentModal = () => {
    if (paymentSaving) return
    setPaymentModal(null)
    setPaymentError(null)
  }

  const openInvoiceModal = (transaction: Transaction) => {
    setInvoiceModal({ transaction })
  }

  const closeInvoiceModal = () => setInvoiceModal(null)

  const handleInvoiceDownload = (transaction: Transaction, format: 'png' | 'pdf') => {
    const vendor = resolveVendorRecord(vendors, transaction.vendor_id)
    const bankName = resolveBankName(banks, transaction.bank_account_id)
    if (format === 'png') {
      downloadInvoiceAsPng(transaction, vendor, bankName, formatCurrency)
    } else {
      downloadInvoiceAsPdf(transaction, vendor, bankName, formatCurrency)
    }
  }

  const handlePaymentSubmit = async () => {
    if (!token || !paymentModal) return
    if (!paymentModal.bankId) {
      setPaymentError('Select a bank or wallet.')
      return
    }
    const amount = convertToBase(Number(paymentModal.amount))
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError('Enter a valid payment amount.')
      return
    }
    const outstanding = getTransactionOutstanding(paymentModal.transaction)
    if (outstanding <= 0) {
      setPaymentError('This transaction is already settled.')
      return
    }
    if (amount > outstanding) {
      setPaymentError(`Amount cannot exceed the outstanding balance of ${formatCurrency(outstanding)}.`)
      return
    }
    setPaymentSaving(true)
    setPaymentError(null)
    try {
      const result = await recordTransactionPayment(token, paymentModal.transaction.transaction_id, {
        amount,
        bank_account_id: paymentModal.bankId
      })
      if (!result.ok) {
        setPaymentError(result.error)
        setPaymentSaving(false)
        return
      }
      applyTransactionUpdate(result.data.data)
      loadBanks({ silent: true })
      setPaymentSaving(false)
      setPaymentModal(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to record this payment.'
      setPaymentError(message)
      setPaymentSaving(false)
    }
  }

  const handleCancelTransaction = async (transactionId: string) => {
    if (!token) return
    setCancelingId(transactionId)
    setBulkError(null)
    try {
      const result = await cancelTransaction(token, transactionId)
      if (!result.ok) {
        setBulkError(result.error)
      } else {
        applyTransactionUpdate(result.data.data)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel this transaction.'
      setBulkError(message)
    } finally {
      setCancelingId(null)
    }
  }

  if (authStatus !== 'authenticated') {
    return <LoadingScreen />
  }

  if (state.status === 'loading') {
    return <LoadingScreen />
  }

  if (state.status === 'error') {
    return (
      <DashboardLayout header={<h1 className="text-3xl font-bold text-slate-900">Transactions</h1>}>
        <div className="rounded-3xl border border-rose-200 bg-white p-10 text-center text-rose-600 shadow-xl">
          <p className="text-lg font-semibold">Unable to load transactions.</p>
          <p className="mt-2 text-sm">{state.message}</p>
          <button
            type="button"
            onClick={() => setRefreshKey(value => value + 1)}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            <RefreshCcw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      header={
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563eb]">Accounting</p>
          <h1 className="text-4xl font-bold text-slate-900">Transactions</h1>
          <p className="text-base text-slate-500">Monitor and settle every CounterParty transaction.</p>
        </div>
      }
      headerActions={
        <button
          type="button"
          onClick={() => setManualModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-[#1d4ed8] px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          New manual transaction
        </button>
      }
    >
      <section className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <FilterToolbar
          filters={filters}
          vendors={vendors}
          onChange={setFilters}
          onReset={() =>
            setFilters({
              vendor_id: '',
              status: '',
              type: '',
              start_date: '',
              end_date: ''
            })
          }
        />
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {[
            { label: 'Pending', value: summary.pending, helper: 'Awaiting action', tone: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Partial', value: summary.partial, helper: 'Payment in progress', tone: 'text-sky-600', bg: 'bg-sky-50' },
            { label: 'Paid', value: summary.paid, helper: 'Settled', tone: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Outstanding', value: summary.owed, helper: 'Still owed', tone: 'text-rose-600', bg: 'bg-rose-50' },
            { label: 'Cancelled', value: summary.cancelled, helper: 'Voided', tone: 'text-slate-500', bg: 'bg-slate-100' },
            { label: 'Total', value: summary.total, helper: 'All-time volume', tone: 'text-slate-700', bg: 'bg-slate-50' }
          ].map(card => (
            <div key={card.label} className={`rounded-2xl border border-slate-100 p-4 ${card.bg}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{card.label}</p>
              <p className={`mt-2 text-2xl font-bold ${card.tone}`}>{formatCurrency(card.value)}</p>
              <p className="text-xs text-slate-500">{card.helper}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-600">{transactionRowsLabel(transactions.length)}</p>
            {bulkError && <p className="text-xs text-rose-600">{bulkError}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!selectedTransactions.length || selectionHasInvalidPayment) {
                  setBulkError('Select pending or partial transactions that still have an outstanding balance.')
                  return
                }
                if (!banks.length) {
                  setBulkError('Add a bank or wallet before marking payments as settled.')
                  return
                }
                setBulkBankId(banks[0]?.id ?? '')
                setBulkPaymentModalOpen(true)
              }}
              disabled={
                !selectedTransactions.length ||
                Boolean(bulkAction) ||
                !banks.length ||
                selectionHasInvalidPayment
              }
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {bulkAction === 'paid' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Mark As Paid
            </button>
            <button
              type="button"
              onClick={() => performBulkAction('cancel')}
              disabled={!selectedIds.length || Boolean(bulkAction)}
              className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {bulkAction === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setRefreshKey(value => value + 1)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    ref={selectAllRef}
                    checked={allVisibleSelected}
                    onChange={event => toggleSelectAll(event.target.checked)}
                  />
                </th>
                <th className="px-4 py-3">ID</th>
                <th className="px-2 py-3">Transaction</th>
                <th className="px-4 py-3">CounterParty</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Paid with</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTransactions.map(transaction => {
                const outstanding = getTransactionOutstanding(transaction)
                const paidAmount = getTransactionPaidAmount(transaction)
                const progress = getTransactionProgress(transaction)
                const payable = isTransactionPayable(transaction)
                const displayStatus = getTransactionResolvedStatus(transaction)
                const canRecordPayment = payable && banks.length > 0
                const paymentBusy =
                  paymentSaving && paymentModal?.transaction.transaction_id === transaction.transaction_id
                return (
                  <tr key={transaction.transaction_id} className="bg-white">
                    <td className="px-4 py-3 align-top">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={Boolean(selected[transaction.transaction_id])}
                        onChange={() => toggleSelection(transaction.transaction_id)}
                      />
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-slate-600">
                      <p className="text-xs font-semibold text-slate-900">
                        {formatDisplayId(transaction.display_id) ?? 'Pending ID'}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-sm font-semibold text-slate-900 capitalize">{transaction.type}</p>
                      {transaction.category && (
                        <p className="text-xs text-slate-500">{transaction.category.replace(/_/g, ' ')}</p>
                      )}
                      {transaction.notes && (
                        <p className="text-xs text-slate-500">Notes: {transaction.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-sm font-semibold text-slate-900">
                      {resolveVendorName(vendors, transaction.vendor_id)}
                    </td>
                    <td className="px-4 py-3 align-top text-sm font-semibold text-slate-900">
                      <span className={getSignedAmount(transaction) >= 0 ? 'text-rose-600' : 'text-emerald-600'}>
                        {formatSignedCurrency(transaction, formatCurrency)}
                      </span>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                          Paid {formatCurrency(paidAmount)}
                        </span>
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">
                          Owed {formatCurrency(outstanding)}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-[width]"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-slate-600">
                      {getPaidWithLabel(transaction, banks)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge status={displayStatus} />
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-500">
                      {formatDate(transaction.created_at)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openInvoiceModal(transaction)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#2563eb]"
                        >
                          <FileText className="h-4 w-4" />
                          Invoice
                        </button>
                        {displayStatus === 'Paid' || displayStatus === 'Cancelled' ? (
                          <p className="text-xs text-slate-400 self-center">No additional actions</p>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openPaymentModal(transaction)}
                              disabled={!canRecordPayment || paymentBusy}
                              className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                            >
                              {paymentBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                              Record payment
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelTransaction(transaction.transaction_id)}
                              disabled={Boolean(bulkAction) || cancelingId === transaction.transaction_id}
                              className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                            >
                              {cancelingId === transaction.transaction_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Ban className="h-4 w-4" />
                              )}
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-400">
                    No transactions found for this filter set.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <p>
          Showing {transactions.length === 0 ? 0 : showingFrom}
          {transactions.length === 0 ? '' : `-${showingTo}`} of {transactions.length} transactions
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToPrevPage}
            disabled={currentPage === 1}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={goToNextPage}
            disabled={currentPage === totalPages || transactions.length === 0}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
      {manualModalOpen && (
        <ManualTransactionModal
          vendors={vendors}
          categories={manualCategories}
          banks={banks}
          values={manualForm}
          onChange={handleManualFieldChange}
          onClose={closeManualModal}
          onSubmit={handleManualSubmit}
          saving={manualSaving}
          error={manualError}
        />
      )}
      {invoiceModal && (
        <InvoiceModal
          transaction={invoiceModal.transaction}
          vendor={resolveVendorRecord(vendors, invoiceModal.transaction.vendor_id)}
          bankName={resolveBankName(banks, invoiceModal.transaction.bank_account_id)}
          onClose={closeInvoiceModal}
          onDownloadPng={() => handleInvoiceDownload(invoiceModal.transaction, 'png')}
          onDownloadPdf={() => handleInvoiceDownload(invoiceModal.transaction, 'pdf')}
        />
      )}
      {paymentModal && (
        <RecordPaymentModal
          transaction={paymentModal.transaction}
          amount={paymentModal.amount}
          bankId={paymentModal.bankId}
          outstanding={getTransactionOutstanding(paymentModal.transaction)}
          paid={getTransactionPaidAmount(paymentModal.transaction)}
          onAmountChange={value => setPaymentModal(prev => (prev ? { ...prev, amount: value } : prev))}
          onBankChange={value => setPaymentModal(prev => (prev ? { ...prev, bankId: value } : prev))}
          onClose={closePaymentModal}
          onSubmit={handlePaymentSubmit}
          banks={banks}
          saving={paymentSaving}
          error={paymentError}
        />
      )}
      {bulkPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Select bank account</p>
                <p className="text-lg font-semibold text-slate-900">Bulk payment</p>
              </div>
              <button type="button" onClick={() => setBulkPaymentModalOpen(false)} className="text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm text-slate-600">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Bank / Wallet</label>
                <select
                  value={bulkBankId}
                  onChange={event => setBulkBankId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  disabled={banksLoading}
                >
                  {banks.map(bank => (
                    <option key={bank.id} value={bank.id}>
                      {bank.name} - {formatCurrency(bank.balance)}
                    </option>
                  ))}
                </select>
                {banksLoading && <p className="mt-2 text-xs text-slate-400">Loading accounts...</p>}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkPaymentModalOpen(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkPaymentModalOpen(false)
                  performBulkAction('paid', bulkBankId)
                }}
                disabled={!bulkBankId || banksLoading || Boolean(bulkAction)}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                Confirm payment
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

const FilterToolbar = ({
  filters,
  vendors,
  onChange,
  onReset
}: {
  filters: Filters
  vendors: VendorRecord[]
  onChange: (next: Filters) => void
  onReset: () => void
}) => {
  const updateFilter = (field: keyof Filters, value: string) => {
    onChange({
      ...filters,
      [field]: value
    })
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <select
        value={filters.vendor_id}
        onChange={event => updateFilter('vendor_id', event.target.value)}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      >
        <option value="">All CounterParties</option>
        {vendors.map(vendor => (
          <option key={vendor.id} value={vendor.id}>
            {vendor.name}
          </option>
        ))}
      </select>
      <select
        value={filters.status}
        onChange={event => updateFilter('status', event.target.value)}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      >
        <option value="">All statuses</option>
        <option value="Pending">Pending</option>
        <option value="Partial">Partial</option>
        <option value="Paid">Paid</option>
        <option value="Cancelled">Cancelled</option>
      </select>
      <select
        value={filters.type}
        onChange={event => updateFilter('type', event.target.value)}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      >
        <option value="">All types</option>
        <option value="purchase">Purchase</option>
        <option value="order">Order</option>
        <option value="membership">Membership</option>
        <option value="manual">Manual</option>
      </select>
      <input
        type="date"
        value={filters.start_date}
        onChange={event => updateFilter('start_date', event.target.value)}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={filters.end_date}
          onChange={event => updateFilter('end_date', event.target.value)}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          Reset
        </button>
      </div>
    </div>
  )
}

const ManualTransactionModal = ({
  vendors,
  categories,
  banks,
  values,
  onChange,
  onClose,
  onSubmit,
  saving,
  error
}: {
  vendors: VendorRecord[]
  categories: TransactionCategory[]
  banks: BankRecord[]
  values: ManualTransactionForm
  onChange: ManualFormChangeHandler
  onClose: () => void
  onSubmit: () => void
  saving: boolean
  error: string | null
}) => {
  const { formatCurrency, currency } = useCurrency()

  const isJournal = values.mode === 'journal_voucher'
  const payeeVendor = resolveVendorRecord(vendors, values.vendor_id)
  const coveringVendor = resolveVendorRecord(vendors, values.journal_vendor_id)
  const entryTypes: { key: ManualTransactionMode; label: string; helper: string }[] = [
    { key: 'standard', label: 'Standard payment', helper: 'Record a manual in/out payment.' },
    { key: 'journal_voucher', label: 'Journal voucher', helper: 'Offset one vendor by another.' }
  ]
  const directionOptions: { key: ManualTransactionDirection; label: string; helper: string }[] = [
    { key: 'out', label: 'Payment out', helper: 'You are paying this vendor.' },
    { key: 'in', label: 'Payment in', helper: 'You are recording money coming in.' }
  ]
  const manualCategoryOptions = categories.filter(option => option !== JOURNAL_CATEGORY)
  const categoryChoices = manualCategoryOptions.length ? manualCategoryOptions : categories
  const requiresBank = !isJournal
  const submitDisabled = saving || (requiresBank && (!banks.length || !values.bank_id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
    <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Manual transaction</p>
            <p className="text-lg font-semibold text-slate-900">Global</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500">
            <span className="sr-only">Close</span>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-4 text-sm text-slate-600">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Entry type</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {entryTypes.map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onChange('mode', option.key)}
                  className={`rounded-2xl border px-3 py-2 text-left transition ${
                    values.mode === option.key
                      ? 'border-[#1d4ed8] bg-[#1d4ed8]/10 text-[#1d4ed8]'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="text-xs text-slate-500">{option.helper}</p>
                </button>
              ))}
            </div>
          </div>
          {isJournal ? (
            <>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Payee</label>
                <select
                  value={values.vendor_id}
                  onChange={event => onChange('vendor_id', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select who is being paid</option>
                  {vendors.map(vendor => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Covered by</label>
                <select
                  value={values.journal_vendor_id}
                  onChange={event => onChange('journal_vendor_id', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select who owed you money</option>
                  {vendors.map(vendor => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">CounterParty</label>
              <select
                value={values.vendor_id}
                onChange={event => onChange('vendor_id', event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select CounterParty</option>
                {vendors.map(vendor => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
              <div className="mt-4">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Bank / Wallet</label>
                <select
                  value={values.bank_id}
                  onChange={event => onChange('bank_id', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  disabled={!banks.length}
                >
                  <option value="">{banks.length ? 'Select account' : 'No accounts available'}</option>
                  {banks.map(bank => (
                    <option key={bank.id} value={bank.id}>
                      {bank.name} - {formatCurrency(bank.balance)}
                    </option>
                  ))}
                </select>
                {!banks.length && (
                  <p className="mt-1 text-xs text-rose-600">Add a bank or wallet before recording manual payments.</p>
                )}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Amount ({currency})</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.amount}
              onChange={event => onChange('amount', event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          {isJournal ? (
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Payment direction</label>
              <p className="mt-1 rounded-2xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
                Journal vouchers always record an outgoing payment to the payee and reduce the selected counterparty's balance.
              </p>
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Payment direction</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {directionOptions.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onChange('direction', option.key)}
                    className={`rounded-2xl border px-3 py-2 text-left transition ${
                      values.direction === option.key
                        ? 'border-[#1d4ed8] bg-[#1d4ed8]/10 text-[#1d4ed8]'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold">{option.label}</p>
                    <p className="text-xs text-slate-500">{option.helper}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Category</label>
            {isJournal ? (
              <input
                type="text"
                value={JOURNAL_CATEGORY.replace(/_/g, ' ')}
                disabled
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm uppercase tracking-wide text-slate-500"
              />
            ) : (
              <select
                value={values.category}
                onChange={event => onChange('category', event.target.value as TransactionCategory)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {categoryChoices.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </div>
          {isJournal && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-900">What happens</p>
              <p className="mt-1">
                Payment to {payeeVendor?.name ?? 'the payee'} was made by {coveringVendor?.name ?? 'the selected counterparty'} on
                your behalf. Their outstanding balance is reduced and no cash or bank movement is recorded.
              </p>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Notes</label>
            <textarea
              value={values.notes}
              onChange={event => onChange('notes', event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={3}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Attachments (optional)</label>
            <textarea
              value={values.attachments}
              onChange={event => onChange('attachments', event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={2}
              placeholder="One URL per line"
            />
          </div>
        </div>
        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            className="inline-flex items-center gap-2 rounded-full bg-[#1d4ed8] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save transaction
          </button>
        </div>
      </div>
    </div>
  )
}

const RecordPaymentModal = ({
  transaction,
  amount,
  bankId,
  outstanding,
  paid,
  onAmountChange,
  onBankChange,
  onClose,
  onSubmit,
  banks,
  saving,
  error
}: {
  transaction: Transaction
  amount: string
  bankId: string
  outstanding: number
  paid: number
  onAmountChange: (value: string) => void
  onBankChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
  banks: BankRecord[]
  saving: boolean
  error: string | null
}) => {
  const { formatCurrency } = useCurrency()

  const progress = getTransactionProgress(transaction)
  const displayId = formatDisplayId(transaction.display_id)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Record payment</p>
            <p className="text-lg font-semibold text-slate-900">
              {displayId ? `Transaction ${displayId}` : `${transaction.type} transaction`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-4 text-sm text-slate-600">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <span>Total {formatCurrency(Math.abs(transaction.amount))}</span>
              <span className="text-emerald-600">Paid {formatCurrency(paid)}</span>
              <span className="text-rose-600">Outstanding {formatCurrency(outstanding)}</span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Payment amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={event => onAmountChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Bank / Wallet</label>
            <select
              value={bankId}
              onChange={event => onBankChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select account
              </option>
              {banks.map(bank => (
                <option key={bank.id} value={bank.id}>
                  {bank.name} - {formatCurrency(bank.balance)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Save payment
          </button>
        </div>
      </div>
    </div>
  )
}

const InvoiceModal = ({
  transaction,
  vendor,
  bankName,
  onClose,
  onDownloadPng,
  onDownloadPdf
}: {
  transaction: Transaction
  vendor: VendorRecord | null
  bankName: string | null
  onClose: () => void
  onDownloadPng: () => void
  onDownloadPdf: () => void
}) => {
  const { formatCurrency } = useCurrency()

  const invoiceNumber = formatDisplayId(transaction.display_id) ?? `TX-${transaction.transaction_id.slice(-6)}`
  const total = Math.abs(transaction.amount ?? 0)
  const paid = getTransactionPaidAmount(transaction)
  const outstanding = getTransactionOutstanding(transaction)
  const issuedDate = formatDate(transaction.created_at)
  const dueDate = formatDate(transaction.updated_at ?? transaction.created_at)
  const description = transaction.category
    ? transaction.category.replace(/_/g, ' ')
    : transaction.type.replace(/_/g, ' ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-3">
      <div className="relative w-full max-w-3xl rounded-[32px] bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-400"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Invoice</p>
            <h2 className="text-3xl font-bold text-slate-900">{invoiceNumber}</h2>
            <p className="text-sm text-slate-500">Issued {issuedDate}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onDownloadPdf}
              className="inline-flex items-center gap-2 rounded-full bg-[#1d4ed8] px-4 py-2 text-sm font-semibold text-white shadow"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
            <button
              type="button"
              onClick={onDownloadPng}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-[#2563eb]"
            >
              <Download className="h-4 w-4" />
              Download PNG
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Bill To</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{vendor?.name ?? 'Unassigned CounterParty'}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Remit To</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">Stockbuddy Operations</p>
            <p className="text-sm text-slate-600">Invoice via {bankName ?? 'any recorded bank account'}</p>
            <p className="text-sm text-slate-600">Due {dueDate}</p>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              <tr>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-4">
                  <p className="font-semibold text-slate-900 capitalize">{description}</p>
                  {transaction.notes && <p className="text-xs text-slate-500">{transaction.notes}</p>}
                </td>
                <td className="px-4 py-4">1</td>
                <td className="px-4 py-4">{formatCurrency(total)}</td>
                <td className="px-4 py-4 font-semibold text-slate-900">{formatCurrency(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-4">
          <div className="rounded-2xl border border-slate-100 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
            <div className="flex justify-between gap-10 border-b border-slate-100 pb-2">
              <span>Total</span>
              <span className="font-semibold text-slate-900">{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between gap-10 border-b border-slate-100 py-2">
              <span>Paid</span>
              <span className="font-semibold text-emerald-600">{formatCurrency(paid)}</span>
            </div>
            <div className="flex justify-between gap-10 pt-2">
              <span>Outstanding</span>
              <span className="font-semibold text-rose-600">{formatCurrency(outstanding)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const sanitizeFilters = (filters: Filters) => {
  const cleaned: Record<string, string> = {}
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      cleaned[key] = value
    }
  })
  return cleaned
}

const resolveBankName = (banks: BankRecord[], bankId: string | null): string | null => {
  if (!bankId) return null
  const bank = banks.find(item => item.id === bankId)
  return bank?.name ?? null
}

const resolveVendorName = (vendors: VendorRecord[] | undefined, vendorId: string | null): string => {
  if (!vendorId) return 'Unassigned'
  if (!Array.isArray(vendors) || vendors.length === 0) {
    return 'Unassigned'
  }
  const vendor = vendors.find(item => item.id === vendorId)
  return vendor?.name ?? 'Unassigned'
}

const resolveVendorRecord = (vendors: VendorRecord[], vendorId: string | null): VendorRecord | null => {
  if (!vendorId) return null
  return vendors.find(item => item.id === vendorId) ?? null
}

const transactionRowsLabel = (count: number): string => {
  if (!count) return 'No transactions found'
  if (count === 1) return '1 transaction'
  return `${count} transactions`
}

const downloadInvoiceAsPng = (
  transaction: Transaction,
  vendor: VendorRecord | null,
  bankName: string | null,
  formatCurrency: (value: number) => string
) => {
  if (typeof document === 'undefined') return
  const canvas = renderInvoiceCanvas(transaction, vendor, bankName, formatCurrency)
  if (!canvas) return
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = `invoice-${transaction.transaction_id}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const renderInvoiceCanvas = (
  transaction: Transaction,
  vendor: VendorRecord | null,
  bankName: string | null,
  formatCurrency: (value: number) => string
) => {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 1100
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  ctx.fillRect(40, 40, canvas.width - 80, canvas.height - 80)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '12px "Segoe UI", sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText('INVOICE', 70, 70)
  ctx.fillStyle = '#0f172a'
  ctx.font = '32px "Segoe UI", sans-serif'
  const invoiceNumber = formatDisplayId(transaction.display_id) ?? `TX-${transaction.transaction_id.slice(-6)}`
  ctx.fillText(invoiceNumber, 70, 94)
  ctx.font = '14px "Segoe UI", sans-serif'
  ctx.fillStyle = '#475569'
  ctx.fillText(`Issued ${formatDate(transaction.created_at)}`, 70, 140)
  ctx.fillText(`Due ${formatDate(transaction.updated_at ?? transaction.created_at)}`, 70, 160)

  ctx.fillStyle = '#0f172a'
  ctx.font = '18px "Segoe UI", sans-serif'
  ctx.fillText('Bill To', 70, 210)
  ctx.font = '16px "Segoe UI", sans-serif'
  ctx.fillText(vendor?.name ?? 'Unassigned CounterParty', 70, 235)
  ctx.fillStyle = '#475569'
  ctx.font = '14px "Segoe UI", sans-serif'

  ctx.fillStyle = '#0f172a'
  ctx.font = '18px "Segoe UI", sans-serif'
  ctx.fillText('Remit To', 470, 210)
  ctx.font = '16px "Segoe UI", sans-serif'
  ctx.fillText('Stockbuddy Operations', 470, 235)
  ctx.fillStyle = '#475569'
  ctx.font = '14px "Segoe UI", sans-serif'
  ctx.fillText(`Invoice via ${bankName ?? 'any recorded bank account'}`, 470, 255)

  ctx.fillStyle = '#0f172a'
  ctx.font = '16px "Segoe UI", sans-serif'
  const description = (transaction.category ?? transaction.type).replace(/_/g, ' ')
  ctx.fillText('Description', 70, 340)
  ctx.fillStyle = '#475569'
  ctx.fillText(description, 70, 365)
  if (transaction.notes) {
    ctx.font = '13px "Segoe UI", sans-serif'
    ctx.fillText(transaction.notes, 70, 385)
  }

  const total = Math.abs(transaction.amount ?? 0)
  const paid = getTransactionPaidAmount(transaction)
  const outstanding = getTransactionOutstanding(transaction)

  ctx.fillStyle = '#0f172a'
  ctx.font = '16px "Segoe UI", sans-serif'
  ctx.fillText(`Total: ${formatCurrency(total)}`, 70, 450)
  ctx.fillText(`Paid: ${formatCurrency(paid)}`, 70, 480)
  ctx.fillText(`Outstanding: ${formatCurrency(outstanding)}`, 70, 510)

  return canvas
}

const downloadInvoiceAsPdf = (
  transaction: Transaction,
  vendor: VendorRecord | null,
  bankName: string | null,
  formatCurrency: (value: number) => string
) => {
  if (typeof document === 'undefined') return
  const blob = buildInvoicePdf(transaction, vendor, bankName, formatCurrency)
  downloadBlob(blob, `invoice-${transaction.transaction_id}.pdf`)
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const buildInvoicePdf = (
  transaction: Transaction,
  vendor: VendorRecord | null,
  bankName: string | null,
  formatCurrency: (value: number) => string
) => {
  const invoiceNumber = formatDisplayId(transaction.display_id) ?? `TX-${transaction.transaction_id.slice(-6)}`
  const total = Math.abs(transaction.amount ?? 0)
  const paid = getTransactionPaidAmount(transaction)
  const outstanding = getTransactionOutstanding(transaction)
  const issuedDate = formatDate(transaction.created_at)
  const dueDate = formatDate(transaction.updated_at ?? transaction.created_at)
  const description = (transaction.category ?? transaction.type).replace(/_/g, ' ')

  const lines = [
    `Invoice ${invoiceNumber}`,
    `Issued: ${issuedDate}`,
    `Due: ${dueDate}`,
    `CounterParty: ${vendor?.name ?? 'Unassigned CounterParty'}`,
    `Remit via: ${bankName ?? 'Any recorded bank account'}`,
    `Description: ${description}`,
    transaction.notes ? `Notes: ${transaction.notes}` : '',
    `Total: ${formatCurrency(total)}`,
    `Paid: ${formatCurrency(paid)}`,
    `Outstanding: ${formatCurrency(outstanding)}`
  ].filter(Boolean)

  const textLines = lines
    .map((line, index) => {
      const y = 760 - index * 24
      return `1 0 0 1 50 ${y} Tm (${escapePdfText(line)}) Tj`
    })
    .join('\n')

  const stream = `BT
/F1 14 Tf
${textLines}
ET`

  return buildSimplePdf(stream)
}

const escapePdfText = (text: string) => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

const buildSimplePdf = (stream: string) => {
  const encoder = new TextEncoder()
  const chunks: string[] = []
  const offsets: number[] = []
  let length = 0
  const append = (content: string) => {
    chunks.push(content)
    length += encoder.encode(content).length
  }
  const appendObject = (content: string) => {
    offsets.push(length)
    append(content)
  }

  append('%PDF-1.4\n')
  appendObject('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n')
  appendObject('2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n')
  appendObject(
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n'
  )
  const streamLength = encoder.encode(stream).length
  appendObject(`4 0 obj<</Length ${streamLength}>>stream\n${stream}\nendstream\nendobj\n`)
  appendObject('5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n')
  const xrefPosition = length
  append(`xref\n0 ${offsets.length + 1}\n`)
  append('0000000000 65535 f \n')
  offsets.forEach(offset => {
    append(`${offset.toString().padStart(10, '0')} 00000 n \n`)
  })
  append(`trailer<</Size ${offsets.length + 1}/Root 1 0 R>>\nstartxref\n${xrefPosition}\n%%EOF`)

  return new Blob(chunks, { type: 'application/pdf' })
}

const summarizeTransactions = (transactions: Transaction[]): TransactionSummary => {
  return transactions.reduce<TransactionSummary>((acc, transaction) => {
    const baseAmount = Math.abs(typeof transaction.amount === 'number' ? transaction.amount : 0)
    const outstanding = getTransactionOutstanding(transaction)
    const paid = getTransactionPaidAmount(transaction)
    const status = getTransactionResolvedStatus(transaction)

    acc.total += baseAmount
    acc.owed += outstanding

    switch (status) {
      case 'Paid':
        acc.paid += paid > 0 ? paid : baseAmount
        break
      case 'Pending':
        acc.pending += baseAmount
        break
      case 'Partial':
        acc.partial += outstanding
        break
      case 'Cancelled':
        acc.cancelled += baseAmount
        break
      default:
        break
    }

    return acc
  }, createSummarySnapshot())
}

const getTransactionPaidAmount = (transaction: Transaction): number => {
  if (typeof transaction.paid_amount === 'number') {
    return transaction.paid_amount > 0 ? transaction.paid_amount : 0
  }
  const value = typeof transaction.amount_paid === 'number' ? Math.abs(transaction.amount_paid) : 0
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return value
}

const getTransactionOutstanding = (transaction: Transaction): number => {
  if (typeof transaction.outstanding_amount === 'number') {
    return transaction.outstanding_amount > 0 ? transaction.outstanding_amount : 0
  }
  const direct =
    typeof transaction.amount_owed === 'number'
      ? Math.abs(transaction.amount_owed)
      : Math.max(Math.abs(transaction.amount) - getTransactionPaidAmount(transaction), 0)
  if (!Number.isFinite(direct) || direct <= 0) {
    return 0
  }
  return direct
}

const getTransactionProgress = (transaction: Transaction): number => {
  if (typeof transaction.payment_progress === 'number') {
    return transaction.payment_progress
  }
  const total = Math.abs(typeof transaction.amount === 'number' ? transaction.amount : 0)
  if (!Number.isFinite(total) || total === 0) {
    return 0
  }
  const ratio = Math.min(getTransactionPaidAmount(transaction), total) / total
  return Math.min(100, Math.max(0, ratio * 100))
}

const getTransactionResolvedStatus = (transaction: Transaction): TransactionStatus => {
  if (transaction.resolved_status) {
    return transaction.resolved_status
  }
  return normalizeTransactionStatus(transaction.status)
}

const getPaidWithLabel = (transaction: Transaction, banks: BankRecord[]): string => {
  const paidAmount = getTransactionPaidAmount(transaction)
  const status = getTransactionResolvedStatus(transaction)
  if (status === 'Cancelled' || paidAmount <= 0) {
    return 'Not paid yet'
  }
  const bankName = resolveBankName(banks, transaction.bank_account_id)
  if (status === 'Partial') {
    return bankName ? `Partial via ${bankName}` : 'Partial payment'
  }
  if (status === 'Paid') {
    return bankName ? `Paid via ${bankName}` : 'Paid'
  }
  return bankName ?? 'Recorded payment'
}

const isTransactionPayable = (transaction: Transaction): boolean => {
  const status = getTransactionResolvedStatus(transaction)
  if (status === 'Cancelled' || status === 'Paid') {
    return false
  }
  return getTransactionOutstanding(transaction) > 0
}

const formatDisplayId = (value?: number | null): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `#${value}`
  }
  return null
}

const formatSignedCurrency = (transaction: Transaction, formatCurrency: (value: number) => string): string => {
  const signed = getSignedAmount(transaction)
  if (!Number.isFinite(signed) || signed === 0) {
    return formatCurrency(0)
  }
  const prefix = signed >= 0 ? '-' : '+'
  return `${prefix}${formatCurrency(Math.abs(signed))}`
}

const formatDate = (value: string | null | undefined): string => {
  if (!value) return 'Not available'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

const statusMeta: Record<TransactionStatus, { label: string; classes: string }> = {
  Pending: { label: 'Pending', classes: 'bg-amber-50 text-amber-700 border border-amber-100' },
  Partial: { label: 'Partial', classes: 'bg-sky-50 text-sky-700 border border-sky-100' },
  Paid: { label: 'Paid', classes: 'bg-emerald-50 text-emerald-700 border border-emerald-100' },
  Cancelled: { label: 'Cancelled', classes: 'bg-rose-50 text-rose-600 border border-rose-100' }
}

const normalizeTransactionStatus = (status: string): TransactionStatus => {
  const normalized = status.trim().toLowerCase()
  if (normalized.startsWith('paid')) return 'Paid'
  if (normalized.startsWith('partial')) return 'Partial'
  if (normalized.startsWith('cancel')) return 'Cancelled'
  return 'Pending'
}

const StatusBadge = ({ status }: { status: string }) => {
  const display = normalizeTransactionStatus(status)
  const meta = statusMeta[display]
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${meta.classes}`}>
      {meta.label}
    </span>
  )
}

export default TransactionsPage
