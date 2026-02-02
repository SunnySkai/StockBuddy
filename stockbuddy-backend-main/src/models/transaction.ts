import { InventoryRecordStatus, InventoryRecordType, InventoryTransactionAction } from './inventory_record'

export type TransactionStatus = 'Pending' | 'Partial' | 'Paid' | 'Cancelled'

export type TransactionType = 'purchase' | 'order' | 'sale' | 'membership' | 'manual'

export type TransactionCategory =
  | 'ticket_purchase'
  | 'ticket_sale'
  | 'ticket_order'
  | 'membership'
  | 'shipping'
  | 'ai_bot'
  | 'salary'
  | 'internal'
  | 'journal_voucher'
  | 'other'

export type ManualTransactionDirection = 'in' | 'out'

export type ManualTransactionMode = 'standard' | 'journal_voucher'

export interface Transaction {
  id: string
  organization_id: string
  tenant: string
  display_id: number | null
  transaction_id: string
  record_id: string | null
  record_type: InventoryRecordType | 'manual' | null
  type: TransactionType
  action: InventoryTransactionAction | null
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
}
