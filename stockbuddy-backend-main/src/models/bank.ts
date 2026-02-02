export interface BankAccount {
  id: string
  organization_id: string
  display_id: number | null
  name: string
  balance: number
  created_at: string
  updated_at: string
}

export type BankAccountCreateInput = {
  name: string
  balance?: number | null
}

export type BankAccountUpdateInput = Partial<BankAccountCreateInput>
