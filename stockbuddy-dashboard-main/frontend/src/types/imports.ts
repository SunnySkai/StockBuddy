export type BulkImportError = {
  rowNumber: number
  message: string
}

export type BulkImportSummary = {
  processed: number
  created: number
  failed: number
  errors: BulkImportError[]
}

export type BulkImportResponse = {
  success: boolean
  data: BulkImportSummary
}

export type BulkColumnHint = {
  key: string
  label: string
  required?: boolean
  helper?: string
  example?: string
}
