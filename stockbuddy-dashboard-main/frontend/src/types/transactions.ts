import type { InventoryRecordStatus, InventoryRecordType } from './inventory'

export type TransactionStatus = 'Pending' | 'Partial' | 'Paid' | 'Cancelled'

export type TransactionType = 'purchase' | 'order' | 'sale' | 'membership' | 'manual'

export type AutomaticTransactionCategory =
  | 'ticket_purchase'
  | 'ticket_sale'
  | 'ticket_order'
  | 'membership'

export type ManualTransactionCategory =
  | 'shipping'
  | 'ai_bot'
  | 'salary'
  | 'internal'
  | 'journal_voucher'
  | 'other'

export type TransactionCategory = AutomaticTransactionCategory | ManualTransactionCategory

export type ManualTransactionDirection = 'in' | 'out'

export type ManualTransactionMode = 'standard' | 'journal_voucher'

export type Transaction = {
  transaction_id: string
  id?: string
  organization_id: string
  tenant?: string
  display_id?: number | null
  record_id: string | null
  record_type: InventoryRecordType | 'manual' | null
  type: TransactionType
  action: string | null
  vendor_id: string | null
  bank_account_id: string | null
  status: TransactionStatus
  record_status: InventoryRecordStatus | null
  amount: number
  amount_paid: number
  amount_owed: number
  notes: string | null
  attachments: string[]
  category: TransactionCategory | null
  created_by_user_id: string | null
  updated_by_user_id: string | null
  paid_at: string | null
  paid_by_user_id: string | null
  cancelled_at: string | null
  cancelled_by_user_id: string | null
  created_at: string
  updated_at: string
  manual_direction?: ManualTransactionDirection | null
  manual_mode?: ManualTransactionMode | null
  journal_vendor_id?: string | null
  manual_reference_id?: string | null
  resolved_status?: TransactionStatus
  outstanding_amount?: number
  paid_amount?: number
  payment_progress?: number
}

export type TransactionSummary = {
  total: number
  paid: number
  pending: number
  partial: number
  cancelled: number
  owed: number
}

export type TransactionFilters = {
  vendor_id?: string
  status?: TransactionStatus
  type?: TransactionType
  start_date?: string
  end_date?: string
}

export type TransactionsResponse = {
  success: boolean
  data: {
    transactions: Transaction[]
    summary: TransactionSummary
  }
}

export type ManualTransactionPayload = {
  vendor_id: string
  type: 'manual'
  amount: number
  category: TransactionCategory
  direction: ManualTransactionDirection
  mode: ManualTransactionMode
  notes?: string | null
  attachments?: string[]
  journal_vendor_id?: string | null
  bank_account_id?: string | null
}
