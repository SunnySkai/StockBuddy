import type { Transaction, TransactionCategory } from '../types/transactions'

export const TRANSACTION_CATEGORIES: TransactionCategory[] = [
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
]

export const getTransactionDirection = (transaction: Transaction): 1 | -1 => {
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

export const getSignedAmount = (transaction: Transaction): number => {
  const amount = typeof transaction.amount === 'number' ? transaction.amount : 0
  if (!Number.isFinite(amount) || amount === 0) {
    return 0
  }
  return getTransactionDirection(transaction) * Math.abs(amount)
}
