import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { RefreshCcw } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import LoadingScreen from '../components/LoadingScreen'
import { useSession } from '../context/SessionContext'
import { useCurrency } from '../context/CurrencyContext'
import { fetchBanks } from '../api/banks'
import { fetchTransactions } from '../api/transactions'
import { fetchVendors } from '../api/vendors'
import type { BankRecord } from '../types/banks'
import type { Transaction, TransactionSummary } from '../types/transactions'
import type { VendorRecord } from '../types/vendors'
import { getSignedAmount } from '../constants/transactions'

const createSummarySnapshot = (): TransactionSummary => ({
  total: 0,
  paid: 0,
  pending: 0,
  partial: 0,
  cancelled: 0,
  owed: 0
})

type BankDetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      bank: BankRecord
      transactions: Transaction[]
      summary: TransactionSummary
      vendors: VendorRecord[]
    }

const BankDetailPage = () => {
  const { bankId } = useParams<{ bankId: string }>()
  const navigate = useNavigate()
  const { token } = useSession()
  const { formatCurrency } = useCurrency()
  const [state, setState] = useState<BankDetailState>({ status: 'loading' })

  const loadData = useCallback(async () => {
    if (!token || !bankId) return
    setState({ status: 'loading' })
    try {
      const [banksResult, vendorsResult, transactionsResult] = await Promise.all([
        fetchBanks(token),
        fetchVendors(token),
        fetchTransactions(token)
      ])

      if (!banksResult.ok) {
        throw new Error(banksResult.error ?? 'Unable to load bank accounts.')
      }
      if (!transactionsResult.ok) {
        throw new Error(transactionsResult.error ?? 'Unable to load transactions.')
      }

      const bank = banksResult.data.data.find(item => item.id === bankId)
      if (!bank) {
        throw new Error('Bank account not found.')
      }

      const vendors = vendorsResult.ok ? vendorsResult.data.data.vendors : []
      const allTransactions = transactionsResult.data.data.transactions ?? []
      const filtered = allTransactions.filter(transaction => transaction.bank_account_id === bankId)
      const summary = summarizeTransactions(filtered)

      setState({
        status: 'ready',
        bank,
        transactions: filtered,
        summary,
        vendors
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.'
      setState({ status: 'error', message })
    }
  }, [bankId, token])

  useEffect(() => {
    if (token && bankId) {
      loadData()
    }
  }, [token, bankId, loadData])

  const summaryCards = useMemo(() => {
    if (state.status !== 'ready') return []
    const { summary } = state
    return [
      { label: 'Pending', value: summary.pending, tone: 'text-amber-600', bg: 'bg-amber-50', helper: 'Awaiting payment' },
      { label: 'Partial', value: summary.partial, tone: 'text-sky-600', bg: 'bg-sky-50', helper: 'Payment in progress' },
      { label: 'Paid', value: summary.paid, tone: 'text-emerald-600', bg: 'bg-emerald-50', helper: 'Settled' },
      { label: 'Outstanding', value: summary.owed, tone: 'text-rose-600', bg: 'bg-rose-50', helper: 'Still owed' },
      { label: 'Cancelled', value: summary.cancelled, tone: 'text-slate-500', bg: 'bg-slate-100', helper: 'Voided' },
      { label: 'Total volume', value: summary.total, tone: 'text-slate-700', bg: 'bg-slate-50', helper: 'All-time' }
    ]
  }, [state])

  if (!bankId) {
    return (
      <DashboardLayout header={<h1 className="text-3xl font-bold text-slate-900">Bank account</h1>}>
        <div className="rounded-3xl border border-rose-200 bg-white p-10 text-center text-rose-600 shadow-xl">
          <p className="text-lg font-semibold">Bank account not specified.</p>
          <button
            type="button"
            onClick={() => navigate('/accounting/banks')}
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
      <DashboardLayout header={<h1 className="text-3xl font-bold text-slate-900">Bank account</h1>}>
        <div className="rounded-3xl border border-rose-200 bg-white p-10 text-center text-rose-600 shadow-xl">
          <p className="text-lg font-semibold">We could not load this bank account.</p>
          <p className="mt-2 text-sm">{state.message}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/accounting/banks')}
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700"
            >
              Back to accounts
            </button>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white"
            >
              <RefreshCcw className="h-4 w-4" />
              Try again
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const { bank, transactions, summary, vendors } = state

  return (
    <DashboardLayout
      header={
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563eb]">
            Bank {formatDisplayId(bank.display_id) ?? 'Pending ID'}
          </p>
          <h1 className="text-4xl font-bold text-slate-900">{bank.name || 'Unnamed account'}</h1>
          <p className="text-base text-slate-500">
            Balance: <span className="font-semibold text-slate-900">{formatCurrency(bank.balance ?? 0)}</span>
          </p>
        </div>
      }
      headerActions={
        <div className="flex gap-2">
          <Link
            to="/accounting/banks"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400"
          >
            Back to accounts
          </Link>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      }
    >
      <section className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Transactions</h2>
            <p className="text-sm text-slate-500">{transactionRowsLabel(transactions.length)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {summaryCards.map(card => (
            <div key={card.label} className={`rounded-2xl border border-slate-100 p-4 ${card.bg}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{card.label}</p>
              <p className={`mt-2 text-2xl font-bold ${card.tone}`}>{formatCurrency(card.value)}</p>
              <p className="text-xs text-slate-500">{card.helper}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Timing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map(transaction => {
                const signedAmount = getSignedAmount(transaction)
                const outstanding = getOutstandingAmount(transaction)
                const paidAmount = getPaidAmount(transaction)
                const progress = getPaymentProgress(transaction)
                return (
                  <tr key={transaction.transaction_id} className="bg-white">
                    <td className="px-4 py-4 align-top">
                      <p className="text-sm font-semibold text-slate-900 capitalize">{transaction.type}</p>
                      <p className="text-xs text-slate-500">
                        ID {formatDisplayId(transaction.display_id) ?? 'pending'} · {formatShortId(transaction.transaction_id)}
                      </p>
                      {transaction.category && (
                        <p className="text-xs text-slate-500">Category: {transaction.category.replace(/_/g, ' ')}</p>
                      )}
                      <p className="text-xs text-slate-500">
                        CounterParty: <span className="font-semibold text-slate-900">{resolveVendorName(vendors, transaction.vendor_id)}</span>
                      </p>
                      {transaction.notes && <p className="text-xs text-slate-500">Notes: {transaction.notes}</p>}
                    </td>
                    <td className="px-4 py-4 align-top text-sm font-semibold text-slate-900">
                      <span className={signedAmount >= 0 ? 'text-rose-600' : 'text-emerald-600'}>
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
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <StatusBadge status={transaction.status} />
                    </td>
                    <td className="px-4 py-4 align-top text-xs text-slate-500">
                      <p>Created: {formatDate(transaction.created_at)}</p>
                      <p>Updated: {formatDate(transaction.updated_at)}</p>
                    </td>
                  </tr>
                )
              })}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">
                    No transactions recorded for this bank yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardLayout>
  )
}

const summarizeTransactions = (transactions: Transaction[]): TransactionSummary => {
  return transactions.reduce((acc, transaction) => {
    const baseAmount = toPositiveCurrency(transaction.amount)
    const outstanding = getOutstandingAmount(transaction)
    const paid = getPaidAmount(transaction)

    acc.total += baseAmount
    acc.owed += outstanding

    switch (transaction.status) {
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

const getPaidAmount = (transaction: Transaction): number => {
  const value = typeof transaction.amount_paid === 'number' ? Math.abs(transaction.amount_paid) : 0
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return value
}

const getOutstandingAmount = (transaction: Transaction): number => {
  const direct =
    typeof transaction.amount_owed === 'number'
      ? Math.abs(transaction.amount_owed)
      : Math.max(Math.abs(transaction.amount) - getPaidAmount(transaction), 0)
  if (!Number.isFinite(direct) || direct <= 0) {
    return 0
  }
  return direct
}

const getPaymentProgress = (transaction: Transaction): number => {
  const total = Math.abs(typeof transaction.amount === 'number' ? transaction.amount : 0)
  if (!Number.isFinite(total) || total === 0) {
    return 0
  }
  const ratio = Math.min(getPaidAmount(transaction), total) / total
  return Math.min(100, Math.max(0, ratio * 100))
}

const toPositiveCurrency = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }
  return Math.abs(value)
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
  return `${value.slice(0, 8)}...`
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

const StatusBadge = ({ status }: { status: string }) => {
  const normalized = normalizeTransactionStatus(status)
  const meta = statusMeta[normalized]
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${meta.classes}`}>
      {meta.label}
    </span>
  )
}

const statusMeta = {
  Pending: { label: 'Pending', classes: 'bg-amber-50 text-amber-700 border border-amber-100' },
  Partial: { label: 'Partial', classes: 'bg-sky-50 text-sky-700 border border-sky-100' },
  Paid: { label: 'Paid', classes: 'bg-emerald-50 text-emerald-700 border border-emerald-100' },
  Cancelled: { label: 'Cancelled', classes: 'bg-rose-50 text-rose-600 border border-rose-100' }
} as const

type StatusKey = keyof typeof statusMeta

const normalizeTransactionStatus = (status: string): StatusKey => {
  const normalized = status.trim().toLowerCase()
  if (normalized.startsWith('paid')) return 'Paid'
  if (normalized.startsWith('partial')) return 'Partial'
  if (normalized.startsWith('cancel')) return 'Cancelled'
  return 'Pending'
}

const resolveVendorName = (vendors: VendorRecord[], vendorId: string | null): string => {
  if (!vendorId) return 'Unassigned'
  const vendor = vendors.find(item => item.id === vendorId)
  return vendor?.name ?? 'Unknown CounterParty'
}

const transactionRowsLabel = (count: number): string => {
  if (!count) return 'No transactions found'
  if (count === 1) return '1 transaction'
  return `${count} transactions`
}

export default BankDetailPage
