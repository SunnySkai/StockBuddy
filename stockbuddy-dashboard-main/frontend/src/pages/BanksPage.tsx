import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, RefreshCcw, Search, Trash2, Landmark } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import BulkActionsButton from '../components/BulkActionsButton'
import LoadingScreen from '../components/LoadingScreen'
import { useSession } from '../context/SessionContext'
import { useCurrency } from '../context/CurrencyContext'
import {
  createBank,
  deleteBank,
  downloadBanksCsv,
  fetchBanks,
  updateBank,
  uploadBanksSpreadsheet
} from '../api/banks'
import type { BankCreatePayload, BankRecord, BankUpdatePayload } from '../types/banks'
import { Link, useNavigate } from 'react-router-dom'
import { BANK_BULK_COLUMNS } from '../constants/bulkColumns'
import type { ApiResult, DownloadPayload } from '../api/client'
import type { BulkImportResponse } from '../types/imports'

type BankForm = {
  name: string
  balance: string
}

const emptyForm: BankForm = {
  name: '',
  balance: ''
}

const numericOrZero = (value: string): number => {
  const trimmed = value.trim()
  if (!trimmed.length) return 0
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? 0 : parsed
}

const BanksPage = () => {
  const navigate = useNavigate()
  const { status, token } = useSession()
  const { formatCurrency, convertFromBase, convertToBase } = useCurrency()
  const [banks, setBanks] = useState<BankRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalValues, setModalValues] = useState<BankForm>(emptyForm)
  const [modalBankId, setModalBankId] = useState<string | null>(null)
  const [modalSaving, setModalSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 250)
    return () => clearTimeout(handle)
  }, [search])

  const showBanner = useCallback((type: 'success' | 'error', message: string) => {
    setBanner({ type, message })
    setTimeout(() => setBanner(null), 3000)
  }, [])

  const loadBanks = useCallback(async () => {
    if (!token) {
      setLoadError('Session expired. Please sign in again.')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setLoadError(null)
    const result = await fetchBanks(token, { search: debouncedSearch || undefined })
    if (!result.ok) {
      setLoadError(result.error)
      setIsLoading(false)
      return
    }
    setBanks(result.data.data)
    setIsLoading(false)
  }, [debouncedSearch, token])

  const authError = <T,>(): Promise<ApiResult<T>> =>
    Promise.resolve({ ok: false as const, error: 'Session expired. Please sign in again.', status: 401 })

  const handleBankDownload = useCallback(() => {
    if (!token) {
      return authError<DownloadPayload>()
    }
    return downloadBanksCsv(token)
  }, [token])

  const handleBankTemplateDownload = useCallback(() => {
    if (!token) {
      return authError<DownloadPayload>()
    }
    return downloadBanksCsv(token, { template: true })
  }, [token])

  const handleBankUpload = useCallback(
    (file: File) => {
      if (!token) {
        return authError<BulkImportResponse>()
      }
      return uploadBanksSpreadsheet(token, file)
    },
    [token]
  )

  useEffect(() => {
    if (status !== 'authenticated') return
    loadBanks()
  }, [loadBanks, status])

  const filteredBanks = useMemo(() => {
    if (!debouncedSearch.length) {
      return banks
    }
    return banks.filter(bank => {
      const haystack = `${bank.name} ${bank.balance}`.toLowerCase()
      return haystack.includes(debouncedSearch)
    })
  }, [banks, debouncedSearch])

  const handleAddClick = () => {
    setModalBankId(null)
    setModalValues(emptyForm)
    setModalError(null)
    setModalOpen(true)
  }

  const handleCardNavigate = (bankId: string | null | undefined) => {
    if (!bankId) return
    navigate(`/accounting/banks/${bankId}`)
  }

  const openModalForEdit = (bank: BankRecord) => {
    setModalBankId(bank.id)
    setModalValues({
      name: bank.name,
      balance: convertFromBase(bank.balance ?? 0).toFixed(2)
    })
    setModalError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setModalBankId(null)
    setModalValues(emptyForm)
    setModalError(null)
    setModalSaving(false)
  }

  const handleModalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) {
      setModalError('Session expired.')
      return
    }
    if (!modalValues.name.trim()) {
      setModalError('Account name is required.')
      return
    }
    setModalSaving(true)
    const basePayload = {
      name: modalValues.name.trim(),
      balance: convertToBase(numericOrZero(modalValues.balance))
    }
    const updatePayload: BankUpdatePayload = basePayload
    const createPayload: BankCreatePayload = basePayload

    try {
      if (modalBankId) {
        const result = await updateBank(token, modalBankId, updatePayload)
        if (!result.ok) {
          throw new Error(result.error)
        }
        setBanks(prev => prev.map(bank => (bank.id === modalBankId ? result.data.data : bank)))
        showBanner('success', 'Account updated.')
      } else {
        const result = await createBank(token, createPayload)
        if (!result.ok) {
          throw new Error(result.error)
        }
        setBanks(prev => [result.data.data, ...prev])
        showBanner('success', 'Account added.')
      }
      closeModal()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save account.'
      setModalError(message)
      setModalSaving(false)
    }
  }

  const handleDelete = async (bank: BankRecord) => {
    if (!token) return
    const confirmed = window.confirm('Delete this account?')
    if (!confirmed) return
    setDeletingId(bank.id)
    const result = await deleteBank(token, bank.id)
    if (!result.ok) {
      setDeletingId(null)
      showBanner('error', result.error)
      return
    }
    setBanks(prev => prev.filter(item => item.id !== bank.id))
    setDeletingId(null)
    showBanner('success', 'Account removed.')
  }

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
            onClick={loadBanks}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            <RefreshCcw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </DashboardLayout>
    )
  }

  const totalBalance = banks.reduce((sum, bank) => sum + (bank.balance ?? 0), 0)

  return (
    <DashboardLayout
      header={
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563eb]">Balances</p>
          <h1 className="text-4xl font-bold text-slate-900">Bank accounts</h1>
          <p className="text-base text-slate-500">Keep your banks and wallets organized with a focused card layout.</p>
        </div>
      }
      headerActions={
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-white/60 bg-white px-4 py-2 text-sm font-semibold text-slate-500 shadow-sm flex items-center gap-3 min-w-[270px]">
            <span className="text-slate-900">{banks.length}</span>
            <span>accounts</span>
            <span className="text-slate-900">{formatCurrency(totalBalance)}</span>
            <span>total balance</span>
          </div>
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

      <section className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="mb-5 flex flex-col items-start sm:flex-row sm:items-center sm:justify-between">
          <div className="sm:ml-auto">
            <BulkActionsButton
              triggerLabel="Import / export accounts"
              title="Import or export accounts"
              description="Pull balances into CSV for your finance system or upload the wallets you already maintain in spreadsheets."
              note="CSV or Excel up to 10MB"
              columns={BANK_BULK_COLUMNS}
              downloadData={handleBankDownload}
              downloadTemplate={handleBankTemplateDownload}
              dataFallbackName="accounts.csv"
              templateFallbackName="bank-accounts-template.csv"
              uploadConfig={{
                label: 'Upload CSV / Excel',
                onUpload: handleBankUpload,
                onComplete: loadBanks
              }}
              className="inline-flex"
            />
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              <Landmark className="h-3.5 w-3.5" />
              <span>Accounts</span>
            </div>
            <h2 className="text-2xl font-semibold text-slate-900">Wallets-Bank Account</h2>
            <p className="text-sm text-slate-500">View your transactions for each account.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-slate-500 sm:w-[320px]">
              <Search className="h-5 w-5" />
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search accounts..."
                className="flex-1 bg-transparent text-base text-slate-700 outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleAddClick}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl"
            >
              <Plus className="h-4 w-4" />
              Add account
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredBanks.map(bank => (
            <div
              key={bank.id}
              role={bank.id ? 'button' : undefined}
              tabIndex={bank.id ? 0 : -1}
              onClick={() => handleCardNavigate(bank.id)}
              onKeyDown={event => {
                if (!bank.id) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleCardNavigate(bank.id)
                }
              }}
              className="rounded-[24px] border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] cursor-pointer transition hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    <Landmark className="h-3.5 w-3.5 text-slate-500" />
                    <span>Bank / Wallet</span>
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">{bank.name || 'Unnamed'}</h3>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                    ID {bank.display_id ? `#${bank.display_id}` : 'pending'}
                  </p>
                </div>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                  {formatCurrency(Number(bank.balance ?? 0))}
                </span>
              </div>
              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation()
                    openModalForEdit(bank)
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#2563eb] hover:text-[#2563eb]"
                >
                  Edit
                </button>
                <Link
                  to={`/accounting/banks/${bank.id}`}
                  onClick={event => event.stopPropagation()}
                  className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100"
                >
                  View
                </Link>
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation()
                    handleDelete(bank)
                  }}
                  disabled={deletingId === bank.id}
                  className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingId === bank.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete
                </button>
              </div>
            </div>
          ))}
          {filteredBanks.length === 0 && (
            <div className="col-span-full rounded-[24px] border border-dashed border-slate-200 bg-white/80 p-12 text-center text-sm text-slate-500">
              Nothing to show yet. Use the “Add account” button.
            </div>
          )}
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="absolute inset-0" role="button" tabIndex={-1} onClick={closeModal} onKeyDown={event => {
            if (event.key === 'Escape') closeModal()
          }} />
          <div className="relative z-10 w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <form onSubmit={handleModalSubmit}>
              <h2 className="text-xl font-semibold text-slate-900">{modalBankId ? 'Edit account' : 'Add account'}</h2>
              <div className="mt-4 space-y-4">
                <label className="text-xs font-semibold text-slate-700">
                  Account name
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
                  {modalBankId ? 'Save account' : 'Add account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

export default BanksPage
