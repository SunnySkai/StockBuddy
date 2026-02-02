import type { Transaction, TransactionStatus } from '../models/transaction'

export const OUTSTANDING_EPSILON = 0.005

export const roundCurrency = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.round(value * 100) / 100
}

export const getSettledAmount = (transaction: Transaction | null | undefined): number => {
  if (!transaction) {
    return 0
  }
  const paid = typeof transaction.amount_paid === 'number' ? transaction.amount_paid : 0
  if (!Number.isFinite(paid) || paid <= 0) {
    return 0
  }
  return roundCurrency(paid)
}

export const getOutstandingAmount = (transaction: Transaction | null | undefined): number => {
  if (!transaction) {
    return 0
  }
  const owed =
    typeof transaction.amount_owed === 'number'
      ? transaction.amount_owed
      : Math.max(transaction.amount - getSettledAmount(transaction), 0)
  const normalized = roundCurrency(owed)
  if (!Number.isFinite(normalized) || normalized <= OUTSTANDING_EPSILON) {
    return 0
  }
  return normalized
}

export type TransactionView = Transaction & {
  resolved_status: TransactionStatus
  paid_amount: number
  outstanding_amount: number
  payment_progress: number
}

export type TransactionSummarySnapshot = {
  total: number
  paid: number
  pending: number
  partial: number
  cancelled: number
  owed: number
}

const resolveTransactionStatusValue = (
  transaction: Transaction,
  outstandingAmount: number,
  settledAmount: number
): TransactionStatus => {
  if (transaction.status === 'Cancelled') {
    return 'Cancelled'
  }
  if (outstandingAmount <= OUTSTANDING_EPSILON) {
    return 'Paid'
  }
  if (transaction.status === 'Partial' || settledAmount > 0) {
    return 'Partial'
  }
  return transaction.status === 'Paid' ? 'Paid' : 'Pending'
}

export const toTransactionView = (transaction: Transaction): TransactionView => {
  const paidAmount = getSettledAmount(transaction)
  const outstandingAmount = getOutstandingAmount(transaction)
  const total = Math.abs(typeof transaction.amount === 'number' ? transaction.amount : 0)
  const paymentProgress =
    total === 0 ? 0 : Math.min(100, Math.max(0, (Math.min(paidAmount, total) / total) * 100))
  const resolvedStatus = resolveTransactionStatusValue(transaction, outstandingAmount, paidAmount)
  return {
    ...transaction,
    resolved_status: resolvedStatus,
    paid_amount: paidAmount,
    outstanding_amount: outstandingAmount,
    payment_progress: paymentProgress
  }
}

export const buildTransactionSummary = (transactions: TransactionView[]): TransactionSummarySnapshot => {
  return transactions.reduce<TransactionSummarySnapshot>(
    (acc, transaction) => {
      const baseAmount = Math.abs(typeof transaction.amount === 'number' ? transaction.amount : 0)
      acc.total += baseAmount
      acc.owed += transaction.outstanding_amount
      switch (transaction.resolved_status) {
        case 'Paid':
          acc.paid += transaction.paid_amount > 0 ? transaction.paid_amount : baseAmount
          break
        case 'Pending':
          acc.pending += baseAmount
          break
        case 'Partial':
          acc.partial += transaction.outstanding_amount
          break
        case 'Cancelled':
          acc.cancelled += baseAmount
          break
        default:
          break
      }
      return acc
    },
    { total: 0, paid: 0, pending: 0, partial: 0, cancelled: 0, owed: 0 }
  )
}
