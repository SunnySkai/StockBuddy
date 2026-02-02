import { apiGet, apiPost, type ApiResult } from './client'
import type {
  ManualTransactionPayload,
  Transaction,
  TransactionFilters,
  TransactionStatus,
  TransactionsResponse
} from '../types/transactions'

const serializeFilters = (filters?: TransactionFilters): string => {
  if (!filters) return ''
  const query = new URLSearchParams()
  if (filters.vendor_id) query.set('vendor_id', filters.vendor_id)
  if (filters.status) query.set('status', filters.status)
  if (filters.type) query.set('type', filters.type)
  if (filters.start_date) query.set('start_date', filters.start_date)
  if (filters.end_date) query.set('end_date', filters.end_date)
  const serialized = query.toString()
  return serialized.length ? `?${serialized}` : ''
}

export type TransactionResponse = { success: boolean; data: Transaction }

export const fetchTransactions = (
  token: string,
  filters?: TransactionFilters
): Promise<ApiResult<TransactionsResponse>> => {
  const query = serializeFilters(filters)
  return apiGet<TransactionsResponse>(`/transactions${query}`, { token })
}

export const createManualTransaction = (
  token: string,
  payload: ManualTransactionPayload
): Promise<ApiResult<TransactionResponse>> => {
  return apiPost<TransactionResponse>('/transactions/manual', payload, { token })
}

const postStatusChange = (
  token: string,
  transactionId: string,
  suffix: 'mark-paid' | 'cancel',
  body?: Record<string, unknown>
): Promise<ApiResult<TransactionResponse>> => {
  return apiPost<TransactionResponse>(`/transactions/${transactionId}/${suffix}`, body ?? {}, { token })
}

export const markTransactionPaid = (
  token: string,
  transactionId: string,
  bankAccountId: string
): Promise<ApiResult<TransactionResponse>> =>
  postStatusChange(token, transactionId, 'mark-paid', { bank_account_id: bankAccountId })

export const cancelTransaction = (
  token: string,
  transactionId: string
): Promise<ApiResult<TransactionResponse>> => postStatusChange(token, transactionId, 'cancel')

export const recordTransactionPayment = (
  token: string,
  transactionId: string,
  payload: { amount: number; bank_account_id: string }
): Promise<ApiResult<TransactionResponse>> => {
  return apiPost<TransactionResponse>(`/transactions/${transactionId}/partial-payment`, payload, { token })
}
