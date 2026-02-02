import * as XLSX from 'xlsx'

export type ParsedSheetRow = {
  rowNumber: number
  values: Record<string, unknown>
}

export type ParsedSpreadsheet = {
  columns: string[]
  rows: ParsedSheetRow[]
}

const insertWordBoundaries = (value: string): string => {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
}

export const normalizeHeaderKey = (header: string): string => {
  if (typeof header !== 'string') {
    header = header === undefined || header === null ? '' : String(header)
  }
  const trimmed = header.trim()
  if (!trimmed.length) {
    return ''
  }
  const withBoundaries = insertWordBoundaries(trimmed)
  return withBoundaries
    .replace(/[\s\-./]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

export const parseSpreadsheet = (buffer: Buffer): ParsedSpreadsheet => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('The uploaded file does not contain a readable sheet.')
  }
  const worksheet = workbook.Sheets[sheetName]
  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, {
    header: 1,
    blankrows: false,
    defval: null,
    raw: false
  }) as any[][]

  if (!rawRows.length) {
    return { columns: [], rows: [] }
  }

  const rawHeaders = rawRows[0]?.map((value) =>
    value === null || value === undefined ? '' : String(value)
  ) ?? []
  const normalizedHeaders = rawHeaders.map((header) => normalizeHeaderKey(header))
  const seen = new Set<string>()
  const headerKeys = normalizedHeaders.map((header) => {
    if (!header || seen.has(header)) {
      return ''
    }
    seen.add(header)
    return header
  })

  const rows: ParsedSheetRow[] = []
  for (let rowIndex = 1; rowIndex < rawRows.length; rowIndex += 1) {
    const rawRow = rawRows[rowIndex] ?? []
    const values: Record<string, unknown> = {}
    let hasValue = false
    headerKeys.forEach((header, columnIndex) => {
      if (!header) {
        return
      }
      const cell = rawRow[columnIndex]
      if (cell !== null && cell !== undefined && String(cell).trim().length > 0) {
        hasValue = true
      }
      values[header] = cell ?? null
    })
    if (hasValue) {
      rows.push({
        rowNumber: rowIndex + 1,
        values
      })
    }
  }

  return {
    columns: Array.from(seen.values()),
    rows
  }
}

export const buildCsvContent = (headers: string[], rows: Array<Record<string, unknown>>): string => {
  if (!headers.length) {
    throw new Error('CSV headers are required.')
  }
  const matrix = [
    headers,
    ...rows.map((row) =>
      headers.map((header) => {
        const value = row[header]
        if (value === null || value === undefined) {
          return ''
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
          return value
        }
        return String(value)
      })
    )
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(matrix)
  return XLSX.utils.sheet_to_csv(worksheet)
}
