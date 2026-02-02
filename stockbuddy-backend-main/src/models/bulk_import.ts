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
