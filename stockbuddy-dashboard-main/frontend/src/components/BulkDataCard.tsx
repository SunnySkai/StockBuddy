import type { ChangeEvent } from 'react'
import { useId, useRef, useState } from 'react'
import { AlertTriangle, Download, Info, Loader2, Upload } from 'lucide-react'
import type { ApiResult, DownloadPayload } from '../api/client'
import type { BulkColumnHint, BulkImportResponse, BulkImportSummary } from '../types/imports'
import { saveBlobToFile } from '../utils/download'

type BulkDataCardProps = {
  title: string
  description: string
  note?: string
  columns?: BulkColumnHint[]
  onDownload: () => Promise<ApiResult<DownloadPayload>>
  downloadLabel?: string
  downloadFallbackName?: string
  uploadConfig?: {
    label?: string
    accept?: string
    onUpload: (file: File) => Promise<ApiResult<BulkImportResponse>>
    onComplete?: () => void
  }
  className?: string
}

const formatSummaryCopy = (summary: BulkImportSummary): string => {
  if (summary.failed > 0) {
    return `Imported ${summary.created} rows. ${summary.failed} row${summary.failed === 1 ? '' : 's'} failed validation.`
  }
  return `Imported ${summary.created} row${summary.created === 1 ? '' : 's'} successfully.`
}

const BulkDataCard = ({
  title,
  description,
  note,
  columns,
  onDownload,
  downloadLabel = 'Download CSV',
  downloadFallbackName = 'export.csv',
  uploadConfig,
  className
}: BulkDataCardProps) => {
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [summary, setSummary] = useState<BulkImportSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  const handleDownload = async () => {
    if (downloadLoading) return
    setFeedback(null)
    try {
      setDownloadLoading(true)
      const result = await onDownload()
      if (!result.ok) {
        setFeedback({ type: 'error', text: result.error })
        return
      }
      const filename = result.data.filename ?? downloadFallbackName
      saveBlobToFile(result.data.blob, filename)
      setFeedback({ type: 'success', text: 'Spreadsheet generated successfully.' })
    } finally {
      setDownloadLoading(false)
    }
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !uploadConfig) return
    setFeedback(null)
    setSummary(null)
    try {
      setUploadLoading(true)
      const result = await uploadConfig.onUpload(file)
      if (!result.ok) {
        setFeedback({ type: 'error', text: result.error })
        return
      }
      const data = result.data.data
      setSummary(data)
      setFeedback({
        type: data.failed > 0 ? 'error' : 'success',
        text: formatSummaryCopy(data)
      })
      uploadConfig.onComplete?.()
    } finally {
      setUploadLoading(false)
    }
  }

  return (
    <section
      className={`rounded-[30px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ${className ?? ''}`}
    >
      <div className="flex flex-col gap-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white">
          <Info className="h-4 w-4" />
          <span>Bulk data</span>
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
          {note && <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloadLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#2563eb] hover:text-[#2563eb] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloadLabel}
          </button>
          {uploadConfig && (
            <>
              <input
                id={inputId}
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={uploadConfig.accept ?? '.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadLoading}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploadConfig.label ?? 'Upload CSV'}
              </button>
            </>
          )}
        </div>
        {feedback && (
          <div
            className={`mt-2 flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {feedback.type === 'success' ? <Info className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {feedback.text}
          </div>
        )}
        {summary && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p>
              Processed {summary.processed} row{summary.processed === 1 ? '' : 's'} — created {summary.created}, failed {summary.failed}.
            </p>
            {summary.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-500">Top issues</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-rose-600">
                  {summary.errors.slice(0, 3).map(error => (
                    <li key={`${error.rowNumber}-${error.message}`}>
                      Row {error.rowNumber}: {error.message}
                    </li>
                  ))}
                  {summary.errors.length > 3 && (
                    <li key="additional-errors" className="text-xs text-rose-500">
                      +{summary.errors.length - 3} more issue{summary.errors.length - 3 === 1 ? '' : 's'}
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
        {columns && columns.length > 0 && (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Column guide</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {columns.map(column => (
                <div key={column.key} className="rounded-xl bg-white px-3 py-2 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">
                    {column.label}{' '}
                    {column.required ? (
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">required</span>
                    ) : (
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">optional</span>
                    )}
                  </p>
                  {column.helper && <p className="text-xs text-slate-500">{column.helper}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export default BulkDataCard
