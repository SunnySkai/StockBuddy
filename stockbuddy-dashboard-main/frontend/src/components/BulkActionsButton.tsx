import { useId, useRef, useState } from 'react'
import { AlertTriangle, Download, Loader2, Upload, X } from 'lucide-react'
import type { ApiResult, DownloadPayload } from '../api/client'
import type { BulkColumnHint, BulkImportResponse, BulkImportSummary } from '../types/imports'
import { saveBlobToFile } from '../utils/download'

type BulkActionsButtonProps = {
  triggerLabel?: string
  title: string
  description?: string
  note?: string
  columns?: BulkColumnHint[]
  downloadData: () => Promise<ApiResult<DownloadPayload>>
  downloadTemplate: () => Promise<ApiResult<DownloadPayload>>
  dataFallbackName?: string
  templateFallbackName?: string
  uploadConfig?: {
    label?: string
    accept?: string
    onUpload: (file: File) => Promise<ApiResult<BulkImportResponse>>
    onComplete?: () => void
  }
  className?: string
}

type FeedbackState = { type: 'success' | 'error'; text: string } | null

const formatSummaryCopy = (summary: BulkImportSummary): string => {
  if (summary.failed > 0) {
    return `Imported ${summary.created} rows. ${summary.failed} row${summary.failed === 1 ? '' : 's'} failed validation.`
  }
  return `Imported ${summary.created} row${summary.created === 1 ? '' : 's'} successfully.`
}

const BulkActionsButton = ({
  triggerLabel = 'Bulk actions',
  title,
  description,
  note,
  columns,
  downloadData,
  downloadTemplate,
  dataFallbackName = 'export.csv',
  templateFallbackName = 'template.csv',
  uploadConfig,
  className
}: BulkActionsButtonProps) => {
  const [open, setOpen] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [summary, setSummary] = useState<BulkImportSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  const closeModal = () => {
    if (uploadLoading || downloadLoading || templateLoading) return
    setOpen(false)
    setFeedback(null)
    setSummary(null)
  }

  const triggerDownload = async (
    variant: 'data' | 'template',
    fallbackFilename: string,
    action: () => Promise<ApiResult<DownloadPayload>>
  ) => {
    if ((variant === 'data' && downloadLoading) || (variant === 'template' && templateLoading)) {
      return
    }
    setFeedback(null)
    try {
      if (variant === 'data') {
        setDownloadLoading(true)
      } else {
        setTemplateLoading(true)
      }
      const result = await action()
      if (!result.ok) {
        setFeedback({ type: 'error', text: result.error })
        return
      }
      const filename = result.data.filename ?? fallbackFilename
      saveBlobToFile(result.data.blob, filename)
      setFeedback({
        type: 'success',
        text: variant === 'data' ? 'Export generated successfully.' : 'Template downloaded.'
      })
    } finally {
      if (variant === 'data') {
        setDownloadLoading(false)
      } else {
        setTemplateLoading(false)
      }
    }
  }

  const handleUpload = async (file: File) => {
    if (!uploadConfig) return
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (file) {
      void handleUpload(file)
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl"
      >
        {triggerLabel}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="absolute inset-0" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Bulk actions</p>
                <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
                {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
                {note && <p className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{note}</p>}
              </div>
              <button type="button" onClick={closeModal} className="text-slate-500 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => triggerDownload('template', templateFallbackName, downloadTemplate)}
                disabled={templateLoading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#2563eb] hover:text-[#2563eb] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {templateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download template
              </button>
              <button
                type="button"
                onClick={() => triggerDownload('data', dataFallbackName, downloadData)}
                disabled={downloadLoading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#2563eb] hover:text-[#2563eb] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {downloadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download current data
              </button>
            </div>

            {uploadConfig && (
              <div className="mt-4">
                <input
                  id={inputId}
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={
                    uploadConfig.accept ??
                    '.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                  }
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadLoading}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploadConfig.label ?? 'Upload spreadsheet'}
                </button>
              </div>
            )}

            {feedback && (
              <div
                className={`mt-4 flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm ${
                  feedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {feedback.type === 'success' ? <Download className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {feedback.text}
              </div>
            )}

            {summary && (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p>
                  Processed {summary.processed} row{summary.processed === 1 ? '' : 's'} – created {summary.created},
                  failed {summary.failed}.
                </p>
                {summary.errors.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-600">
                    {summary.errors.slice(0, 3).map(error => (
                      <li key={`${error.rowNumber}-${error.message}`}>
                        Row {error.rowNumber}: {error.message}
                      </li>
                    ))}
                    {summary.errors.length > 3 && (
                      <li className="text-rose-500">
                        +{summary.errors.length - 3} more issue{summary.errors.length - 3 === 1 ? '' : 's'}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {columns && columns.length > 0 && (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
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
                      {column.example && (
                        <p className="text-xs text-slate-400">
                          Example: <span className="text-slate-600">{column.example}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default BulkActionsButton
