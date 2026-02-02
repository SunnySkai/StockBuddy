import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { RefreshCcw, Plus, CheckCircle2, Ban, Loader2, X, CreditCard } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import LoadingScreen from '../components/LoadingScreen'
import { useSession } from '../context/SessionContext'
import { useCurrency } from '../context/CurrencyContext'
import { fetchVendorTransactions, fetchVendors } from '../api/vendors'
import { fetchBanks } from '../api/banks'
import { fetchFootballFixtureById, type FootballFixtureDetail } from '../api/events'
import { createManualTransaction, cancelTransaction, recordTransactionPayment } from '../api/transactions'
import type { InventoryRecord } from '../types/inventory'
import type { VendorMembershipTransaction, VendorRecord } from '../types/vendors'
import type {
  ManualTransactionDirection,
  ManualTransactionMode,
  ManualTransactionPayload,
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionSummary
} from '../types/transactions'
import type { BankRecord } from '../types/banks'
import { TRANSACTION_CATEGORIES, getSignedAmount } from '../constants/transactions'

type VendorDetailReadyState = {
  status: 'ready'
  vendor: VendorRecord
  records: InventoryRecord[]
  memberships: VendorMembershipTransaction[]
  transactions: Transaction[]
  totals: TransactionSummary
}

type VendorDetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | VendorDetailReadyState

type FixtureMeta = {
  title: string
  home: {
    name: string | null
    logo: string | null
  }
  away: {
    name: string | null
    logo: string | null
  }
}

type ManualTransactionForm = {
  mode: ManualTransactionMode
  amount: string
  category: TransactionCategory
  direction: ManualTransactionDirection
  journal_vendor_id: string
  notes: string
  attachments: string
  bank_id: string
}

type ManualFormChangeHandler = <K extends keyof ManualTransactionForm>(
  field: K,
  value: ManualTransactionForm[K]
) => void

const MANUAL_EXCLUDED_CATEGORIES: TransactionCategory[] = [
  'ticket_purchase',
  'ticket_sale',
  'ticket_order',
  'membership'
]

const JOURNAL_CATEGORY: TransactionCategory = 'journal_voucher'

const MANUAL_CATEGORY_OPTIONS = (() => {
  const filtered = TRANSACTION_CATEGORIES.filter(
    category => !MANUAL_EXCLUDED_CATEGORIES.includes(category) && category !== JOURNAL_CATEGORY
  )
  return filtered.length ? filtered : [...TRANSACTION_CATEGORIES]
})()

const getDefaultManualCategory = (): TransactionCategory =>
  (MANUAL_CATEGORY_OPTIONS.length ? MANUAL_CATEGORY_OPTIONS[0] : TRANSACTION_CATEGORIES[0])

type TransactionRow = {
  transaction: Transaction
  record?: InventoryRecord
}

const defaultTransactionSummary: TransactionSummary = {
  total: 0,
  paid: 0,
  pending: 0,
  partial: 0,
  cancelled: 0,
  owed: 0
}

const roundToCents = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.round(value * 100) / 100
}

const VendorDetailPage = () => {
  const { vendorId } = useParams<{ vendorId: string }>()
  const navigate = useNavigate()
  const { token } = useSession()
  const { formatCurrency, currency, convertToBase, convertFromBase } = useCurrency()
  const [state, setState] = useState<VendorDetailState>({ status: 'loading' })
  const [fixtures, setFixtures] = useState<Record<string, FixtureMeta | undefined>>({})
  const [fixturesLoading, setFixturesLoading] = useState(false)
  const [vendorOptions, setVendorOptions] = useState<VendorRecord[]>([])
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [manualForm, setManualForm] = useState<ManualTransactionForm>({
    mode: 'standard',
    amount: '',
    category: getDefaultManualCategory(),
    direction: 'out',
    journal_vendor_id: '',
    notes: '',
    attachments: '',
    bank_id: ''
  })
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [transactionActions, setTransactionActions] = useState<Record<string, 'cancel'>>({})
  const [banks, setBanks] = useState<BankRecord[]>([])
  const [banksLoading, setBanksLoading] = useState(false)
  const [paymentModal, setPaymentModal] = useState<{
    transaction: Transaction
    bankId: string
    amount: string
  } | null>(null)
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  useEffect(() => {
    if (banks.length && !manualForm.bank_id) {
      setManualForm(prev => ({ ...prev, bank_id: prev.bank_id || banks[0].id }))
    }
  }, [banks, manualForm.bank_id])

  const loadVendor = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token || !vendorId) {
        return
      }
      if (!options?.silent) {
        setState({ status: 'loading' })
      }
      try {
        const result = await fetchVendorTransactions(token, vendorId)
        if (!result.ok) {
          if (options?.silent) {
            setActionError(result.error)
          } else {
            setState({ status: 'error', message: result.error })
          }
          return
        }
        const data = result.data.data
        setState({
          status: 'ready',
          vendor: data.vendor,
          records: data.records ?? [],
          memberships: data.memberships ?? [],
          transactions: data.transactions ?? [],
          totals: data.totals ?? { ...defaultTransactionSummary }
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load vendor.'
        if (options?.silent) {
          setActionError(message)
        } else {
          setState({ status: 'error', message })
        }
      }
    },
    [token, vendorId]
  )

  useEffect(() => {
    loadVendor()
  }, [loadVendor])

  useEffect(() => {
    if (!token) return
    const loadVendors = async () => {
      try {
        const result = await fetchVendors(token)
        if (result.ok) {
          setVendorOptions(result.data.data.vendors)
        }
      } catch {
        setActionError(prev => prev ?? 'Unable to load vendor list.')
      }
    }
    loadVendors()
  }, [token])

  useEffect(() => {
    if (!token) return
    setBanksLoading(true)
    fetchBanks(token)
      .then(result => {
        if (result.ok) {
          setBanks(result.data.data)
        }
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : 'Unable to load bank accounts.'
        setActionError(message)
      })
      .finally(() => setBanksLoading(false))
  }, [token])

  const transactionRows = useMemo<TransactionRow[]>(() => {
    if (state.status !== 'ready') return []
    const recordIndex = new Map(state.records.map(record => [record.id, record]))
    return [...(state.transactions ?? [])]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(transaction => ({
        transaction,
        record: transaction.record_id ? recordIndex.get(transaction.record_id) : undefined
      }))
  }, [state])

  const totals = useMemo(() => {
    if (state.status !== 'ready') {
      return { ...defaultTransactionSummary }
    }
    return summarizeTransactions(state.transactions)
  }, [state])

  const manualRequiresBank = manualForm.mode !== 'journal_voucher'
  const manualSubmitDisabled =
    manualSaving || (manualRequiresBank && (!banks.length || !manualForm.bank_id))

  const handleManualFieldChange: ManualFormChangeHandler = (field, value) => {
    setManualForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'mode') {
        if (value === 'journal_voucher') {
          next.category = JOURNAL_CATEGORY
          next.direction = 'out'
        } else if (prev.category === JOURNAL_CATEGORY) {
          next.category = getDefaultManualCategory()
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
      amount: '',
      direction: 'out',
      journal_vendor_id: '',
      notes: '',
      attachments: '',
      category: getDefaultManualCategory(),
      bank_id: banks[0]?.id ?? ''
    }))
  }

  const handleManualSubmit = async () => {
    if (!token || state.status !== 'ready') return
    const isJournal = manualForm.mode === 'journal_voucher'
    if (isJournal) {
      if (!manualForm.journal_vendor_id.trim()) {
        setManualError('Select who is covering this payment.')
        return
      }
      if (manualForm.journal_vendor_id === state.vendor.id) {
        setManualError('The covering vendor must be different from the payee.')
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
      vendor_id: state.vendor.id,
      type: 'manual',
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
    setManualForm(prev => ({
      ...prev,
      amount: '',
      notes: '',
      attachments: ''
    }))
    setManualSaving(false)
    setManualModalOpen(false)
    await loadVendor({ silent: true })
  }

  const handleCancelTransaction = async (transaction: Transaction) => {
    if (!token) return
    setTransactionActions(prev => ({ ...prev, [transaction.transaction_id]: 'cancel' }))
    setActionError(null)
    try {
      const result = await cancelTransaction(token, transaction.transaction_id)
      if (!result.ok) {
        setActionError(result.error)
      } else {
        await loadVendor({ silent: true })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update transaction.'
      setActionError(message)
    } finally {
      setTransactionActions(prev => {
        const nextMap = { ...prev }
        delete nextMap[transaction.transaction_id]
        return nextMap
      })
    }
  }

  const openPaymentModal = (transaction: Transaction) => {
    if (!banks.length) {
      setActionError('Add a bank or wallet before recording a payment.')
      return
    }
    const outstanding = roundToCents(getTransactionOutstanding(transaction))
    if (outstanding <= 0) {
      setActionError('This transaction is already settled.')
      return
    }
    setPaymentModal({
      transaction,
      bankId: transaction.bank_account_id ?? banks[0]?.id ?? '',
      amount: convertFromBase(outstanding).toFixed(2)
    })
    setPaymentError(null)
  }

  const closePaymentModal = () => {
    if (paymentSaving) return
    setPaymentModal(null)
    setPaymentError(null)
  }

  const handlePaymentSubmit = async () => {
    if (!token || !paymentModal) return
    if (!paymentModal.bankId) {
      setPaymentError('Select a bank or wallet.')
      return
    }
    const amount = roundToCents(convertToBase(Number(paymentModal.amount)))
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError('Enter a valid payment amount.')
      return
    }
    const outstanding = roundToCents(getTransactionOutstanding(paymentModal.transaction))
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
      } else {
        setPaymentModal(null)
        await loadVendor({ silent: true })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to record this payment.'
      setPaymentError(message)
    } finally {
      setPaymentSaving(false)
    }
  }

  useEffect(() => {
    if (!token || state.status !== 'ready') {
      return
    }
    const uniqueGameIds = Array.from(new Set(state.records.map(record => record.game_id).filter(Boolean))) as string[]
    const missing = uniqueGameIds.filter(gameId => !fixtures[gameId])
    if (!missing.length) {
      return
    }

    let cancelled = false
    setFixturesLoading(true)

    Promise.all(
      missing.map(async gameId => {
        const result = await fetchFootballFixtureById(token, gameId)
        if (!result.ok || !result.data.data.response.length) {
          return [gameId, undefined] as [string, FixtureMeta | undefined]
        }
        const detail = result.data.data.response[0]
        return [gameId, buildFixtureMeta(detail)] as [string, FixtureMeta]
      })
    )
      .then(entries => {
        if (cancelled) return
        setFixtures(prev => {
          const next = { ...prev }
          entries.forEach(([gameId, detail]) => {
            next[gameId] = detail
          })
          return next
        })
      })
      .finally(() => {
        if (!cancelled) {
          setFixturesLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [token, state, fixtures])

  if (!vendorId) {
    return (
      <DashboardLayout header={<h1 className="text-3xl font-bold text-slate-900">CounterParty</h1>}>
        <div className="rounded-3xl border border-rose-200 bg-white p-10 text-center text-rose-600 shadow-xl">
          <p className="text-lg font-semibold">CounterParty not specified.</p>
          <button
            type="button"
            onClick={() => navigate('/vendors')}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            Go back
          </button>
        </div>
      </DashboardLayout>
    )
  }

  if (state.status === 'loading') {
    return <LoadingScreen />
  }

  if (state.status === 'error') {
    return (
      <DashboardLayout header={<h1 className="text-3xl font-bold text-slate-900">CounterParty</h1>}>
        <div className="rounded-3xl border border-rose-200 bg-white p-10 text-center text-rose-600 shadow-xl">
          <p className="text-lg font-semibold">We could not load this CounterParty.</p>
          <p className="mt-2 text-sm">{state.message}</p>
          <button
            type="button"
            onClick={() => loadVendor()}
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
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563eb]">
            CounterParty {formatDisplayId(state.vendor.display_id) ?? 'Pending ID'}
          </p>
          <h1 className="text-4xl font-bold text-slate-900">{state.vendor.name}</h1>
          <p className="text-base text-slate-500">
            Balance: <span className="font-semibold text-slate-900">{formatCurrency(state.vendor.balance ?? 0)}</span>
          </p>
        </div>
      }
      headerActions={
        <Link
          to="/vendors"
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400"
        >
          Back to CounterParties
        </Link>
      }
    >
      <section className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Transactions</h2>
            <p className="text-sm text-slate-500">{transactionRows.length} entries tracked.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => loadVendor({ silent: true })}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                setManualModalOpen(true)
                setManualError(null)
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[#1d4ed8] px-4 py-2 text-xs font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              New manual transaction
            </button>
          </div>
        </div>

        {state.status === 'ready' && (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {[
              { label: 'Pending', value: totals.pending, tone: 'text-amber-600', bg: 'bg-amber-50', helper: 'Awaiting payment' },
              { label: 'Partial', value: totals.partial, tone: 'text-sky-600', bg: 'bg-sky-50', helper: 'Payment in progress' },
              { label: 'Paid', value: totals.paid, tone: 'text-emerald-600', bg: 'bg-emerald-50', helper: 'Settled' },
              { label: 'Outstanding', value: totals.owed, tone: 'text-rose-600', bg: 'bg-rose-50', helper: 'Still owed' },
              { label: 'Cancelled', value: totals.cancelled, tone: 'text-slate-500', bg: 'bg-slate-100', helper: 'Voided' },
              { label: 'Total volume', value: totals.total, tone: 'text-slate-700', bg: 'bg-slate-50', helper: 'All-time' }
            ].map(card => (
              <div key={card.label} className={`rounded-2xl border border-slate-100 p-4 ${card.bg}`}>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{card.label}</p>
                <p className={`mt-2 text-2xl font-bold ${card.tone}`}>{formatCurrency(card.value)}</p>
                <p className="text-xs text-slate-500">{card.helper}</p>
              </div>
            ))}
          </div>
        )}

        {fixturesLoading && (
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Syncing fixtures...</p>
        )}

        {actionError && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {actionError}
          </div>
        )}

        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Timing</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactionRows.map(({ transaction, record }) => {
                const actionState = transactionActions[transaction.transaction_id]
                const signedAmount = getSignedAmount(transaction)
                const outstanding = getTransactionOutstanding(transaction)
                const paidAmount = getTransactionPaidAmount(transaction)
                const progress = getTransactionProgress(transaction)
                const payable = isTransactionPayable(transaction)
                const canRecordPayment = payable && banks.length > 0 && !banksLoading
                const paymentBusy =
                  paymentSaving && paymentModal?.transaction.transaction_id === transaction.transaction_id
                const resolvedStatus = getTransactionResolvedStatus(transaction)
                const showActions = resolvedStatus !== 'Paid' && resolvedStatus !== 'Cancelled'
                return (
                  <tr key={transaction.transaction_id} className="bg-white">
                    <td className="px-4 py-4 align-top text-sm text-slate-600">
                      <p className="text-xs font-semibold text-slate-900">
                        {formatDisplayId(transaction.display_id) ?? 'Pending ID'}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <TransactionInfoCell
                        transaction={transaction}
                        record={record}
                        fixture={record?.game_id ? fixtures[record.game_id] : undefined}
                      />
                    </td>
                    <td className="px-4 py-4 align-top text-sm font-semibold text-slate-900">
                      <span className={signedAmount >= 0 ? 'text-rose-600' : 'text-emerald-600'}>
                      {formatSignedCurrency(signedAmount, formatCurrency)}
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
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <StatusBadge status={resolvedStatus} />
                    </td>
                    <td className="px-4 py-4 align-top text-xs text-slate-500">
                      <p>Created: {formatDate(transaction.created_at)}</p>
                      <p>Updated: {formatDate(transaction.updated_at)}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      {showActions ? (
                        <div className="flex flex-wrap gap-2">
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
                            onClick={() => handleCancelTransaction(transaction)}
                            disabled={Boolean(actionState)}
                            className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {actionState === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">No actions</p>
                      )}
                    </td>
                  </tr>
                )
              })}
              {transactionRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400">
                    No transactions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {manualModalOpen && state.status === 'ready' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Manual transaction</p>
                <p className="text-lg font-semibold text-slate-900">{state.vendor.name}</p>
              </div>
              <button type="button" onClick={closeManualModal} className="text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm text-slate-600">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Entry type</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(['standard', 'journal_voucher'] as ManualTransactionMode[]).map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleManualFieldChange('mode', option)}
                      className={`rounded-2xl border px-3 py-2 text-left transition ${
                        manualForm.mode === option
                          ? 'border-[#1d4ed8] bg-[#1d4ed8]/10 text-[#1d4ed8]'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <p className="text-sm font-semibold">
                        {option === 'journal_voucher' ? 'Journal voucher' : 'Standard payment'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {option === 'journal_voucher'
                          ? 'Offset what another vendor owes you.'
                          : 'Record a manual in/out payment.'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Amount ({currency})</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualForm.amount}
                  onChange={event => handleManualFieldChange('amount', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              {manualForm.mode === 'journal_voucher' ? (
                <>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Covered by (who owed you)
                    </label>
                    <select
                      value={manualForm.journal_vendor_id}
                      onChange={event => handleManualFieldChange('journal_vendor_id', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">Select a vendor</option>
                      {vendorOptions
                        .filter(vendor => vendor.id !== state.vendor.id)
                        .map(vendor => (
                          <option key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    <p className="font-semibold text-slate-900">What happens</p>
                    <p className="mt-1">
                      Payment to {state.vendor.name} is marked as paid without touching cash.{' '}
                      {vendorOptions.find(vendor => vendor.id === manualForm.journal_vendor_id)?.name ?? 'The selected vendor'} owed
                      you money, so their balance is reduced automatically.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Payment direction</label>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      {(['out', 'in'] as ManualTransactionDirection[]).map(option => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => handleManualFieldChange('direction', option)}
                          className={`rounded-2xl border px-3 py-2 text-left transition ${
                            manualForm.direction === option
                              ? 'border-[#1d4ed8] bg-[#1d4ed8]/10 text-[#1d4ed8]'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <p className="text-sm font-semibold">{option === 'out' ? 'Payment out' : 'Payment in'}</p>
                          <p className="text-xs text-slate-500">
                            {option === 'out' ? 'You are paying this vendor.' : 'You are recording money coming in.'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Bank / Wallet</label>
                    <select
                      value={manualForm.bank_id}
                      onChange={event => handleManualFieldChange('bank_id', event.target.value)}
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
                      <p className="mt-1 text-xs text-rose-600">
                        Add a bank or wallet before recording manual payments.
                      </p>
                    )}
                  </div>
                </>
              )}
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Category</label>
                {manualForm.mode === 'journal_voucher' ? (
                  <input
                    type="text"
                    value={JOURNAL_CATEGORY.replace(/_/g, ' ')}
                    disabled
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm uppercase tracking-wide text-slate-500"
                  />
                ) : (
                  <select
                    value={manualForm.category}
                    onChange={event => handleManualFieldChange('category', event.target.value as TransactionCategory)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {MANUAL_CATEGORY_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Notes</label>
                <textarea
                  value={manualForm.notes}
                  onChange={event => handleManualFieldChange('notes', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Optional notes about this transaction"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Attachments</label>
                <textarea
                  value={manualForm.attachments}
                  onChange={event => handleManualFieldChange('attachments', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  rows={2}
                  placeholder="One URL per line (optional)"
                />
              </div>
            </div>
            {manualError && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {manualError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeManualModal}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                disabled={manualSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualSubmit}
                disabled={manualSubmitDisabled}
                className="inline-flex items-center gap-2 rounded-full bg-[#1d4ed8] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {manualSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save transaction
              </button>
            </div>
          </div>
        </div>
      )}
      {paymentModal && state.status === 'ready' && (
        <VendorPaymentModal
          vendorName={state.vendor.name}
          transaction={paymentModal.transaction}
          amount={paymentModal.amount}
          bankId={paymentModal.bankId}
          outstanding={getTransactionOutstanding(paymentModal.transaction)}
          paid={getTransactionPaidAmount(paymentModal.transaction)}
          banks={banks}
          onAmountChange={value => setPaymentModal(prev => (prev ? { ...prev, amount: value } : prev))}
          onBankChange={value => setPaymentModal(prev => (prev ? { ...prev, bankId: value } : prev))}
          onClose={closePaymentModal}
          onSubmit={handlePaymentSubmit}
          saving={paymentSaving}
          error={paymentError}
        />
      )}
    </DashboardLayout>
  )
}

const VendorPaymentModal = ({
  vendorName,
  transaction,
  amount,
  bankId,
  outstanding,
  paid,
  banks,
  onAmountChange,
  onBankChange,
  onClose,
  onSubmit,
  saving,
  error
}: {
  vendorName: string
  transaction: Transaction
  amount: string
  bankId: string
  outstanding: number
  paid: number
  banks: BankRecord[]
  onAmountChange: (value: string) => void
  onBankChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
  saving: boolean
  error: string | null
}) => {
  const { formatCurrency } = useCurrency()

  const progress = getTransactionProgress(transaction)
  const displayId = formatDisplayId(transaction.display_id)
  const shortId = formatShortId(transaction.transaction_id)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Record payment</p>
            <p className="text-lg font-semibold text-slate-900">{vendorName}</p>
            <p className="text-xs text-slate-500" title={transaction.transaction_id}>
              {displayId ? `Transaction ${displayId}` : `Transaction ${shortId}`} | {transaction.type}
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
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
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

const InventoryRecordCell = ({
  record,
  fixture
}: {
  record: InventoryRecord & { role: 'bought' | 'sold' | 'unknown' }
  fixture?: FixtureMeta
}) => {
  const roleMeta =
    record.role === 'bought'
      ? { label: 'Purchased from vendor', classes: 'bg-indigo-50 text-indigo-700 border border-indigo-100' }
      : record.role === 'sold'
        ? { label: 'Sold to vendor', classes: 'bg-emerald-50 text-emerald-700 border border-emerald-100' }
        : { label: 'Referenced', classes: 'bg-slate-100 text-slate-500 border border-slate-200' }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-500">Record</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-normal ${roleMeta.classes}`}>{roleMeta.label}</span>
      </div>
      <GameCell fixture={fixture} fallbackId={record.game_id ?? 'N/A'} />
      <p className="text-xs text-slate-500">
        Quantity:{' '}
        <span className="font-semibold text-slate-900">
          {record.quantity}
        </span>
      </p>
      <p className="text-xs text-slate-500">
        Status:{' '}
        <span className="font-semibold text-slate-900">{record.status}</span>
      </p>
    </div>
  )
}

const TransactionInfoCell = ({
  transaction,
  record,
  fixture
}: {
  transaction: Transaction
  record?: InventoryRecord
  fixture?: FixtureMeta
}) => (
  <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
      {transaction.category && (
        <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-semibold text-white">
          {transaction.category.replace(/_/g, ' ')}
        </span>
      )}
    </div>
    {record ? (
      <>
        <GameCell fixture={fixture} fallbackId={record.game_id ?? 'N/A'} />
      </>
    ) : (
      <p className="text-xs italic text-slate-500">Manual transaction</p>
    )}
    {transaction.notes && (
      <p className="text-xs text-slate-500">Notes: {transaction.notes}</p>
    )}
    {transaction.attachments && transaction.attachments.length > 0 && (
      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
        {transaction.attachments.map(attachment => (
          <a
            key={attachment}
            href={attachment}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
          >
            Attachment
          </a>
        ))}
      </div>
    )}
  </div>
)

const formatDate = (value: string | null | undefined): string => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

const buildFixtureMeta = (detail: FootballFixtureDetail): FixtureMeta => {
  const homeName = detail.teams.home?.name ?? 'Home'
  const awayName = detail.teams.away?.name ?? 'Away'
  return {
    title: `${homeName} vs ${awayName}`,
    home: {
      name: homeName,
      logo: detail.teams.home?.logo ?? null
    },
    away: {
      name: awayName,
      logo: detail.teams.away?.logo ?? null
    }
  }
}

const GameCell = ({ fixture, fallbackId }: { fixture?: FixtureMeta; fallbackId: string }) => {
  if (!fixture) {
    return (
      <div>
        <p className="text-sm font-semibold text-slate-900">{fallbackId}</p>
        <p className="text-xs text-slate-500">Fixture details unavailable</p>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-3">
        <TeamLogoBlock team={fixture.home} />
        <span className="text-xs font-semibold uppercase text-slate-400 tracking-[0.3em]">VS</span>
        <TeamLogoBlock team={fixture.away} align="right" />
      </div>
    </div>
  )
}

const TeamLogoBlock = ({ team, align = 'left' }: { team: { name: string | null; logo: string | null }; align?: 'left' | 'right' }) => (
  <div className={`flex items-center gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
    {team.logo ? (
      <img src={team.logo} alt={`${team.name ?? 'Team'} logo`} className="h-10 w-10 rounded-full border border-slate-200 object-cover" />
    ) : (
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold uppercase text-slate-500">
        {(team.name ?? 'TM').slice(0, 2)}
      </div>
    )}
    <span className="text-sm font-semibold text-slate-900">{team.name ?? 'TBD'}</span>
  </div>
)

const summarizeTransactions = (transactions: Transaction[]): TransactionSummary => {
  return transactions.reduce(
    (acc, transaction) => {
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
    },
    { ...defaultTransactionSummary }
  )
}

const formatDisplayId = (value?: number | null): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `#${value}`
  }
  return null
}

const formatShortId = (value?: string): string => {
  if (!value) return 'N/A'
  if (value.length <= 8) {
    return value
  }
  return `${value.slice(0, 8)}â¦`
}

const getTransactionPaidAmount = (transaction: Transaction): number => {
  if (typeof transaction.paid_amount === 'number') {
    return transaction.paid_amount > 0 ? transaction.paid_amount : 0
  }
  const value = typeof transaction.amount_paid === 'number' ? transaction.amount_paid : 0
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return value
}

const getTransactionOutstanding = (transaction: Transaction): number => {
  if (typeof transaction.outstanding_amount === 'number') {
    return transaction.outstanding_amount > 0 ? transaction.outstanding_amount : 0
  }
  const value =
    typeof transaction.amount_owed === 'number'
      ? transaction.amount_owed
      : Math.max(Math.abs(transaction.amount) - getTransactionPaidAmount(transaction), 0)
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return value
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
  return normalizeTransactionStatus(transaction.status ?? '')
}

const isTransactionPayable = (transaction: Transaction): boolean => {
  const status = getTransactionResolvedStatus(transaction)
  if (status === 'Cancelled' || status === 'Paid') {
    return false
  }
  return getTransactionOutstanding(transaction) > 0
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

const formatSignedCurrency = (value: number, formatCurrency: (value: number) => string): string => {
  if (!Number.isFinite(value) || value === 0) {
    return formatCurrency(0)
  }
  const prefix = value >= 0 ? '-' : '+'
  return `${prefix}${formatCurrency(Math.abs(value))}`
}

export default VendorDetailPage
