export type BankRecord = {
  id: string
  organization_id: string
  display_id?: number | null
  name: string
  balance: number
  created_at: string
  updated_at: string
}

export type BankListResponse = {
  success: boolean
  data: BankRecord[]
}

export type BankDetailResponse = {
  success: boolean
  data: BankRecord
}

export type BankCreatePayload = {
  name: string
  balance?: number | string | null
}

export type BankUpdatePayload = Partial<BankCreatePayload>
