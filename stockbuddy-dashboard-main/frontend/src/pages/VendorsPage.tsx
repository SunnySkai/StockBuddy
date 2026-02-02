import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  CreditCard
} from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import BulkActionsButton from '../components/BulkActionsButton'
import LoadingScreen from '../components/LoadingScreen'
import { useSession } from '../context/SessionContext'
import { useCurrency } from '../context/CurrencyContext'
import {
  createVendor,
  deleteVendor,
  downloadVendorsCsv,
  fetchVendors,
  updateVendor,
  uploadVendorsSpreadsheet
} from '../api/vendors'
import type { VendorCreatePayload, VendorRecord, VendorUpdatePayload } from '../types/vendors'
import { VENDOR_BULK_COLUMNS } from '../constants/bulkColumns'
import type { ApiResult, DownloadPayload } from '../api/client'
import type { BulkImportResponse } from '../types/imports'

type VendorForm = {
  name: string
  balance: string
}

type VendorRow = {
  id: string
  record: VendorRecord
  values: VendorForm
  dirty: boolean
  saving: boolean
  deleting: boolean
  error: string | null
  isNew: boolean
}

const emptyForm: VendorForm = {
  name: '',
  balance: ''
}

const toForm = (record: VendorRecord, convertFromBase: (value: number) => number): VendorForm => ({
  name: record.name,
  balance: convertFromBase(record.balance ?? 0).toFixed(2)
})

const numericOrZero = (value: string): number => {
  const trimmed = value.trim()
  if (!trimmed.length) return 0
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? 0 : parsed
}

const buildRow = (record: VendorRecord, convertFromBase: (value: number) => number): VendorRow => ({
  id: record.id,
  record,
  values: toForm(record, convertFromBase),
  dirty: false,
  saving: false,
  deleting: false,
  error: null,
  isNew: false
})

const VendorsPage = () => {
  const navigate = useNavigate()
  const { status, token } = useSession()
  const { formatCurrency, convertFromBase, convertToBase } = useCurrency()
  const [rows, setRows] = useState<VendorRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [summary, setSummary] = useState<{ count: number; total_balance: number }>({
    count: 0,
    total_balance: 0
  })

  const resolveBalanceBase = useCallback(
    (row: VendorRow): number => {
      const raw = row.values.balance.trim()
      if (raw.length) {
        return convertToBase(numericOrZero(raw))
      }
      return row.record.balance ?? 0
    },
    [convertToBase]
  )

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(handle)
  }, [search])

  const showBanner = useCallback((type: 'success' | 'error', message: string) => {
    setBanner({ type, message })
    setTimeout(() => setBanner(null), 3000)
  }, [])

  const adjustSummary = useCallback((deltaCount: number, deltaBalance: number) => {
    setSummary(prev => ({
      count: Math.max(0, prev.count + deltaCount),
      total_balance: prev.total_balance + deltaBalance
    }))
  }, [])

  const loadVendors = useCallback(async () => {
    if (!token) {
      setLoadError('Session expired. Please sign in again.')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setLoadError(null)
    const result = await fetchVendors(token)
    if (!result.ok) {
      setLoadError(result.error)
      setIsLoading(false)
      return
    }
    const payload = result.data.data
    const vendors = payload.vendors ?? []
    setRows(vendors.map(record => buildRow(record, convertFromBase)))
    const summaryPayload =
      payload.summary ??
      vendors.reduce(
        (acc, vendor) => ({
          count: acc.count + 1,
          total_balance: acc.total_balance + (vendor.balance ?? 0)
        }),
        { count: 0, total_balance: 0 }
      )
    setSummary(summaryPayload)
    setIsLoading(false)
  }, [convertFromBase, token])

  const authError = <T,>(): Promise<ApiResult<T>> =>
    Promise.resolve({ ok: false as const, error: 'Session expired. Please sign in again.', status: 401 })

  const handleVendorDownload = useCallback(() => {
    if (!token) {
      return authError<DownloadPayload>()
    }
    return downloadVendorsCsv(token)
  }, [token])

  const handleVendorTemplateDownload = useCallback(() => {
    if (!token) {
      return authError<DownloadPayload>()
    }
    return downloadVendorsCsv(token, { template: true })
  }, [token])

  const handleVendorUpload = useCallback(
    (file: File) => {
      if (!token) {
        return authError<BulkImportResponse>()
      }
      return uploadVendorsSpreadsheet(token, file)
    },
    [token]
  )

  useEffect(() => {
    if (status !== 'authenticated') return
    loadVendors()
  }, [loadVendors, status])

  const handleRowSave = async (rowId: string) => {
    const row = rows.find(item => item.id === rowId)
    if (!row || !token) return
    if (!row.values.name.trim()) {
      showBanner('error', 'CounterParty name is required.')
      return
    }

    setRows(prev =>
      prev.map(item => (item.id === rowId ? { ...item, saving: true, error: null } : item))
    )

    const payload: VendorCreatePayload = {
      name: row.values.name.trim(),
      balance: convertToBase(numericOrZero(row.values.balance))
    }

    if (row.isNew) {
      const result = await createVendor(token, payload)
      if (!result.ok) {
        setRows(prev =>
          prev.map(item => (item.id === rowId ? { ...item, saving: false, error: result.error } : item))
        )
        showBanner('error', result.error)
        return
      }
      const persisted = buildRow(result.data.data, convertFromBase)
      setRows(prev => prev.map(item => (item.id === rowId ? persisted : item)))
      adjustSummary(1, result.data.data.balance ?? 0)
      showBanner('success', 'CounterParty added.')
      return
    }

    const result = await updateVendor(token, row.record.id, payload as VendorUpdatePayload)
    if (!result.ok) {
      setRows(prev =>
        prev.map(item => (item.id === rowId ? { ...item, saving: false, error: result.error } : item))
      )
      showBanner('error', result.error)
      return
    }
    const updated = buildRow(result.data.data, convertFromBase)
    setRows(prev => prev.map(item => (item.id === rowId ? updated : item)))
    adjustSummary(0, (result.data.data.balance ?? 0) - (row.record.balance ?? 0))
    showBanner('success', 'CounterParty updated.')
  }

  const handleRowDelete = async (rowId: string) => {
    const row = rows.find(item => item.id === rowId)
    if (!row) return
    if (row.isNew) {
      setRows(prev => prev.filter(item => item.id !== rowId))
      return
    }
    if (!token) return
    const confirmed = window.confirm('Delete this CounterParty?')
    if (!confirmed) return
    setRows(prev =>
      prev.map(item => (item.id === rowId ? { ...item, deleting: true, error: null } : item))
    )
    const result = await deleteVendor(token, row.record.id)
    if (!result.ok) {
      setRows(prev =>
        prev.map(item => (item.id === rowId ? { ...item, deleting: false, error: result.error } : item))
      )
      showBanner('error', result.error)
      return
    }
    setRows(prev => prev.filter(item => item.id !== rowId))
    adjustSummary(-1, -(row.record.balance ?? 0))
    showBanner('success', 'CounterParty removed.')
  }

  const handleAddRow = () => {
    setModalVendorId(null)
    setModalValues(emptyForm)
    setModalError(null)
    setModalOpen(true)
  }

  const handleCardNavigate = (vendorId?: string) => {
    if (!vendorId) return
    navigate(`/vendors/${vendorId}`)
  }

  const [modalOpen, setModalOpen] = useState(false)
  const [modalValues, setModalValues] = useState<VendorForm>(emptyForm)
  const [modalVendorId, setModalVendorId] = useState<string | null>(null)
  const [modalSaving, setModalSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const openModalForEdit = (row: VendorRow) => {
    setModalVendorId(row.record.id || row.id)
    setModalValues(row.values)
    setModalError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setModalError(null)
    setModalVendorId(null)
    setModalValues(emptyForm)
    setModalSaving(false)
  }

  const handleModalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) {
      setModalError('Session expired.')
      return
    }
    if (!modalValues.name.trim()) {
      setModalError('CounterParty name is required.')
      return
    }

    setModalSaving(true)
    const basePayload = {
      name: modalValues.name.trim(),
      balance: convertToBase(numericOrZero(modalValues.balance)),
    }
    const updatePayload: VendorUpdatePayload = basePayload
    const createPayload: VendorCreatePayload = basePayload

    if (modalVendorId && rows.some(row => row.record.id === modalVendorId)) {
      const result = await updateVendor(token, modalVendorId, updatePayload)
      if (!result.ok) {
        setModalError(result.error)
        setModalSaving(false)
        return
      }
      const updated = buildRow(result.data.data, convertFromBase)
      setRows(prev => prev.map(item => (item.record.id === modalVendorId ? updated : item)))
      setModalSaving(false)
      closeModal()
      showBanner('success', 'CounterParty updated.')
      return
    }

    const result = await createVendor(token, createPayload)
    if (!result.ok) {
      setModalError(result.error)
      setModalSaving(false)
      return
    }
    setRows(prev => [buildRow(result.data.data, convertFromBase), ...prev])
    setModalSaving(false)
    closeModal()
    showBanner('success', 'CounterParty added.')
  }

  const filteredRows = useMemo(() => {
    const query = debouncedSearch.toLowerCase()
    if (!query.length) {
      return rows
    }
    return rows.filter(row => {
      if (row.isNew) return true
      const haystack = `${row.values.name || row.record.name} ${row.values.balance || row.record.balance}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [debouncedSearch, rows])

  if (isLoading) {
    return <LoadingScreen />
  }

  if (loadError) {
    return (
      <DashboardLayout header={<h1 className="text-3xl font-bold text-slate-900">Balances</h1>}>
        <div className="rounded-3xl border border-rose-200 bg-white p-10 text-center text-rose-600 shadow-xl">
          <p className="text-lg font-semibold">We could not load your balances.</p>
          <p className="mt-2 text-sm">{loadError}</p>
          <button
            type="button"
            onClick={loadVendors}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            <RefreshCcw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      header={
        <div className="space-y-4 max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563eb]">CounterParty Balances</p>
          <h1 className="text-4xl font-bold text-slate-900">Balance ledger</h1>
          <p className="text-base text-slate-500">
            Track every partner or supplier in a lightweight card layout. Keep balances in sync and update details from one place.
          </p>
        </div>
      }
      headerActions={
        <div className="rounded-2xl border border-white/60 bg-white px-5 py-2 text-sm font-semibold text-slate-500 shadow-sm min-w-[270px]">
          <span className="text-slate-900">{summary.count}</span> balances&nbsp;&mdash;&nbsp;
          <span className="text-slate-900">{formatCurrency(convertFromBase(summary.total_balance))}</span> total balance
        </div>
      }
    >
      {banner && (
        <div
          className={`mb-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
            banner.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {banner.message}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <BulkActionsButton
          triggerLabel="Import / export counterparties"
          title="Import or export counterparties"
          description="Upload the vendor list you already maintain in Excel or download every balance for offline reporting."
          note="CSV or Excel up to 10MB"
          columns={VENDOR_BULK_COLUMNS}
          downloadData={handleVendorDownload}
          downloadTemplate={handleVendorTemplateDownload}
          dataFallbackName="counterparties.csv"
          templateFallbackName="counterparties-template.csv"
          uploadConfig={{
            label: 'Upload CSV / Excel',
            onUpload: handleVendorUpload,
            onComplete: loadVendors
          }}
          className="inline-flex"
        />
      </div>

      <section className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white">
              <CreditCard className="h-3.5 w-3.5" />
              CounterParty overview
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-slate-500 sm:w-[320px]">
              <Search className="h-5 w-5" />
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search CounterParties..."
                className="flex-1 bg-transparent text-base text-slate-700 outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl"
            >
              <Plus className="h-4 w-4" />
              Add CounterParty
            </button>
          </div>
        </div>

        <section className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredRows.map(row => {
              const isNavigable = Boolean(row.record.id)
              return (
                <div
                  key={row.id}
                  role={isNavigable ? 'button' : undefined}
                  tabIndex={isNavigable ? 0 : -1}
                  onClick={() => handleCardNavigate(row.record.id ?? undefined)}
                  onKeyDown={event => {
                    if (!isNavigable) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleCardNavigate(row.record.id ?? undefined)
                    }
                  }}
                  className={`rounded-[24px] border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] ${
                    isNavigable ? 'cursor-pointer transition hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-indigo-200' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                        <CreditCard className="h-3.5 w-3.5 text-slate-500" />
                        <span>CounterParty</span>
                      </div>
                      <h3 className="mt-2 text-xl font-semibold text-slate-900">
                        {row.values.name || row.record.name || 'Unnamed'}
                      </h3>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                        ID {row.record.display_id ? `#${row.record.display_id}` : 'pending'}
                      </p>
                    </div>
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                      {formatCurrency(resolveBalanceBase(row))}
                    </span>
                  </div>
                  <div className="mt-5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation()
                        openModalForEdit(row)
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#2563eb] hover:text-[#2563eb]"
                    >
                      Edit
                    </button>
                    {row.record.id && (
                      <Link
                        to={`/vendors/${row.record.id}`}
                        onClick={event => event.stopPropagation()}
                        className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100"
                      >
                        Inspect
                      </Link>
                    )}
                    <button
                      type="button"
                      disabled={row.deleting}
                      onClick={event => {
                        event.stopPropagation()
                        handleRowDelete(row.id)
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {row.deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
            {filteredRows.length === 0 && (
              <div className="col-span-full rounded-[24px] border border-dashed border-slate-200 bg-white/80 p-12 text-center text-sm text-slate-500">
                Nothing to show yet. Use the “Add CounterParty” button.
              </div>
            )}
        </section>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div
            className="absolute inset-0"
            role="button"
            tabIndex={-1}
            onClick={closeModal}
            onKeyDown={event => {
              if (event.key === 'Escape') closeModal()
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <form onSubmit={handleModalSubmit}>
              <h2 className="text-xl font-semibold text-slate-900">{modalVendorId ? 'Edit CounterParty' : 'Add CounterParty'}</h2>
              <div className="mt-4 space-y-4">
                <label className="text-xs font-semibold text-slate-700">
                  CounterParty name
                  <input
                    type="text"
                    value={modalValues.name}
                    onChange={event => setModalValues(prev => ({ ...prev, name: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#2563eb]"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Balance
                  <input
                    type="number"
                    value={modalValues.balance}
                    onChange={event => setModalValues(prev => ({ ...prev, balance: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#2563eb]"
                  />
                </label>
              </div>
              {modalError && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600">
                  {modalError}
                </div>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-2 text-xs font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {modalSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {modalVendorId ? 'Save CounterParty' : 'Add CounterParty'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

export default VendorsPage
