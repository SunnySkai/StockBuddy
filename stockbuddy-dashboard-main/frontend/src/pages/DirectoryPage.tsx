import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  ChevronRight,
  Link2,
  Loader2,
  Mail,
  Phone,
  Plus,
  Users2
} from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import BulkActionsButton from '../components/BulkActionsButton'
import { useSession } from '../context/SessionContext'
import {
  createDirectoryCounterparty,
  createDirectoryCustomer,
  downloadDirectoryCounterpartiesCsv,
  downloadDirectoryCustomersCsv,
  fetchDirectoryEntries,
  updateDirectoryCounterparty,
  updateDirectoryCustomer,
  uploadDirectoryCounterpartiesSpreadsheet,
  uploadDirectoryCustomersSpreadsheet
} from '../api/directory'
import { fetchVendors } from '../api/vendors'
import type { VendorRecord } from '../types/vendors'
import type {
  DirectoryCounterpartyRecord,
  DirectoryCustomerRecord
} from '../types/directory'
import { DIRECTORY_COUNTERPARTY_BULK_COLUMNS, DIRECTORY_CUSTOMER_BULK_COLUMNS } from '../constants/bulkColumns'
import type { ApiResult, DownloadPayload } from '../api/client'
import type { BulkImportResponse } from '../types/imports'

type ModalMode = 'customer' | 'counterparty'
type EditingEntry = { mode: ModalMode; id: string } | null

type CustomerEntry = {
  id: string
  displayId: string
  name: string
  number: string
  email?: string
  notes?: string
}

type CounterpartyEntry = {
  id: string
  displayId: string
  name: string
  phone: string
  role?: string
  email?: string
  context?: string
  vendorName?: string
  vendorId?: string
}

const mapCustomerRecord = (record: DirectoryCustomerRecord): CustomerEntry => ({
  id: record.id,
  displayId: record.display_id,
  name: record.name,
  number: record.number,
  email: record.email ?? undefined,
  notes: record.notes ?? undefined
})

const mapCounterpartyRecord = (record: DirectoryCounterpartyRecord): CounterpartyEntry => ({
  id: record.id,
  displayId: record.display_id,
  name: record.name,
  phone: record.phone,
  role: record.role ?? undefined,
  email: record.email ?? undefined,
  context: record.context ?? undefined,
  vendorName: record.vendor_name ?? undefined,
  vendorId: record.vendor_id ?? undefined
})

const emptyCustomerForm = {
  name: '',
  number: '',
  email: '',
  notes: ''
}

const emptyCounterpartyForm = {
  name: '',
  phone: '',
  role: '',
  email: '',
  context: '',
  vendorId: ''
}

const DirectoryPage = () => {
  const { token } = useSession()
  const [customers, setCustomers] = useState<CustomerEntry[]>([])
  const [counterparties, setCounterparties] = useState<CounterpartyEntry[]>([])
  const [activeTab, setActiveTab] = useState<'customers' | 'counterparties'>('customers')
  const [modalMode, setModalMode] = useState<ModalMode>('customer')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<EditingEntry>(null)
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm)
  const [counterpartyForm, setCounterpartyForm] = useState(emptyCounterpartyForm)
  const [modalError, setModalError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [vendorOptions, setVendorOptions] = useState<VendorRecord[]>([])
  const [vendorsError, setVendorsError] = useState<string | null>(null)

  const header = useMemo(
    () => (
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#cbd6ff] bg-white/80 px-4 py-1.5 text-xs font-semibold text-[#1d4ed8] shadow-sm">
          <Users2 className="h-4 w-4" />
          Operator directory
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.45em] text-[#8aa0ff]">Directory</p>
          <h1 className="mt-2 text-4xl font-semibold text-slate-900">Store Your Contacts</h1>
          <p className="mt-3 max-w-3xl text-base text-slate-500">
            Store important contacts and organize it based on your CounterParties
          </p>
        </div>
      </div>
    ),
    []
  )

  const resetForms = useCallback(() => {
    setCustomerForm(emptyCustomerForm)
    setCounterpartyForm(emptyCounterpartyForm)
    setModalError(null)
  }, [])

  const loadDirectory = useCallback(async () => {
    if (!token) return
    setIsLoading(true)
    setLoadError(null)
    const result = await fetchDirectoryEntries(token)
    if (!result.ok) {
      setLoadError(result.error)
      setIsLoading(false)
      return
    }
    const { customers: customerRecords, counterparties: counterpartyRecords } = result.data.data
    setCustomers(customerRecords.map(mapCustomerRecord))
    setCounterparties(counterpartyRecords.map(mapCounterpartyRecord))
    setIsLoading(false)
  }, [token])

  const loadVendors = useCallback(async () => {
    if (!token) return
    const result = await fetchVendors(token)
    if (!result.ok) {
      setVendorsError(result.error)
      return
    }
    setVendorOptions(result.data.data.vendors)
    setVendorsError(null)
  }, [token])

  useEffect(() => {
    if (!token) return
    void loadDirectory()
    void loadVendors()
  }, [loadDirectory, loadVendors, token])

  const authError = <T,>(): Promise<ApiResult<T>> =>
    Promise.resolve({ ok: false as const, error: 'Session expired. Please sign in again.', status: 401 })

  const handleCustomerDataDownload = useCallback(() => {
    if (!token) {
      return authError<DownloadPayload>()
    }
    return downloadDirectoryCustomersCsv(token)
  }, [token])

  const handleCustomerTemplateDownload = useCallback(() => {
    if (!token) {
      return authError<DownloadPayload>()
    }
    return downloadDirectoryCustomersCsv(token, { template: true })
  }, [token])

  const handleCustomerUpload = useCallback(
    (file: File) => {
      if (!token) {
        return authError<BulkImportResponse>()
      }
      return uploadDirectoryCustomersSpreadsheet(token, file)
    },
    [token]
  )

  const handleCounterpartyDataDownload = useCallback(() => {
    if (!token) {
      return authError<DownloadPayload>()
    }
    return downloadDirectoryCounterpartiesCsv(token)
  }, [token])

  const handleCounterpartyTemplateDownload = useCallback(() => {
    if (!token) {
      return authError<DownloadPayload>()
    }
    return downloadDirectoryCounterpartiesCsv(token, { template: true })
  }, [token])

  const handleCounterpartyUpload = useCallback(
    (file: File) => {
      if (!token) {
        return authError<BulkImportResponse>()
      }
      return uploadDirectoryCounterpartiesSpreadsheet(token, file)
    },
    [token]
  )

  const openModal = useCallback((mode: ModalMode) => {
    setModalMode(mode)
    setModalOpen(true)
    setModalError(null)
  }, [])

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setEditingEntry(null)
    resetForms()
    setIsSaving(false)
  }, [resetForms])

  const handleNewEntryClick = useCallback(
    (mode: ModalMode) => {
      setEditingEntry(null)
      resetForms()
      openModal(mode)
    },
    [openModal, resetForms]
  )

  const handleEditCustomer = useCallback((entry: CustomerEntry) => {
    setCustomerForm({
      name: entry.name,
      number: entry.number,
      email: entry.email ?? '',
      notes: entry.notes ?? ''
    })
    setEditingEntry({ mode: 'customer', id: entry.id })
    openModal('customer')
  }, [openModal])

  const handleEditCounterparty = useCallback((entry: CounterpartyEntry) => {
    setCounterpartyForm({
      name: entry.name,
      phone: entry.phone,
      role: entry.role ?? '',
      email: entry.email ?? '',
      context: entry.context ?? '',
      vendorId: entry.vendorId ?? ''
    })
    setEditingEntry({ mode: 'counterparty', id: entry.id })
    openModal('counterparty')
  }, [openModal])

  const displayLoadingState = isLoading ? (
    <div className="flex items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/40 p-10 text-sm text-slate-500">
      Loading directory...
    </div>
  ) : loadError ? (
    <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
      <p>{loadError}</p>
      <button
        type="button"
        onClick={() => loadDirectory()}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-300 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-400"
      >
        Retry
      </button>
    </div>
  ) : null

  const renderCustomers = () => {
    if (isLoading || loadError) {
      return displayLoadingState
    }
    if (customers.length === 0) {
      return (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white/40 p-10 text-center text-sm text-slate-500">
          No customer numbers logged yet. Add concierge lines, sponsor phones, or escalation contacts to give the squad quick reach.
        </div>
      )
    }
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {customers.map(entry => (
          <article
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => handleEditCustomer(entry)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleEditCustomer(entry)
              }
            }}
            className="cursor-pointer rounded-[28px] border border-slate-100 bg-white/90 p-5 text-sm text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:ring-offset-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-300">{entry.displayId}</p>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Customer</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">{entry.name}</h3>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {entry.notes || 'Add reminders on how or when to call this customer.'}
            </p>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-slate-600">
                <Phone className="h-4 w-4 text-[#2563eb]" />
                {entry.number}
              </div>
              <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-slate-600">
                <Mail className="h-4 w-4 text-[#2563eb]" />
                {entry.email || 'Add an email'}
              </div>
            </div>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#1d4ed8]">
              <Link2 className="h-3.5 w-3.5" />
              Ready for outreach
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </article>
        ))}
      </div>
    )
  }

  const renderCounterparties = () => {
    if (isLoading || loadError) {
      return displayLoadingState
    }
    if (counterparties.length === 0) {
      return (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white/40 p-10 text-center text-sm text-slate-500">
          No counterparty contacts yet. Add vendor-side humans so every shift knows exactly who to call.
        </div>
      )
    }
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {counterparties.map(contact => (
          <article
            key={contact.id}
            role="button"
            tabIndex={0}
            onClick={() => handleEditCounterparty(contact)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleEditCounterparty(contact)
              }
            }}
            className="cursor-pointer rounded-[28px] border border-slate-100 bg-white/90 p-5 text-sm text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:ring-offset-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-300">{contact.displayId}</p>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">Counterparty</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900">{contact.name}</h3>
                {contact.vendorName && (
                  <p className="text-sm font-semibold text-slate-500">Vendor: {contact.vendorName}</p>
                )}
              </div>
              <Building2 className="h-10 w-10 text-slate-200" />
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{contact.role || 'Role TBD'}</p>
            <p className="mt-2 text-sm text-slate-500">
              {contact.context || 'Drop quick context here so the team knows how to approach them.'}
            </p>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-slate-600">
                <Phone className="h-4 w-4 text-[#1d4ed8]" />
                {contact.phone}
              </div>
              <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-slate-600">
                <Mail className="h-4 w-4 text-[#1d4ed8]" />
                {contact.email || 'Add an email'}
              </div>
            </div>
          </article>
        ))}
      </div>
    )
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) {
      setModalError('Session expired. Please sign in again.')
      return
    }
    setModalError(null)
    setIsSaving(true)

    try {
      if (modalMode === 'customer') {
        const name = customerForm.name.trim()
        const number = customerForm.number.trim()
        if (!name || !number) {
          setModalError('Name and number are required.')
          setIsSaving(false)
          return
        }
        const payload = {
          name,
          number,
          email: customerForm.email.trim().length ? customerForm.email.trim() : null,
          notes: customerForm.notes.trim().length ? customerForm.notes.trim() : null
        }
        const result = editingEntry?.mode === 'customer'
          ? await updateDirectoryCustomer(token, editingEntry.id, payload)
          : await createDirectoryCustomer(token, payload)
        if (!result.ok) {
          setModalError(result.error)
          setIsSaving(false)
          return
        }
      } else {
        const name = counterpartyForm.name.trim()
        const phone = counterpartyForm.phone.trim()
        if (!name || !phone) {
          setModalError('Name and phone are required.')
          setIsSaving(false)
          return
        }
        const payload = {
          name,
          phone,
          role: counterpartyForm.role.trim().length ? counterpartyForm.role.trim() : null,
          email: counterpartyForm.email.trim().length ? counterpartyForm.email.trim() : null,
          context: counterpartyForm.context.trim().length ? counterpartyForm.context.trim() : null,
          vendor_id: counterpartyForm.vendorId || null
        }
        const result = editingEntry?.mode === 'counterparty'
          ? await updateDirectoryCounterparty(token, editingEntry.id, payload)
          : await createDirectoryCounterparty(token, payload)
        if (!result.ok) {
          setModalError(result.error)
          setIsSaving(false)
          return
        }
      }
      await loadDirectory()
      closeModal()
    } finally {
      setIsSaving(false)
    }
  }

  const selectedVendor = counterpartyForm.vendorId
    ? vendorOptions.find(option => option.id === counterpartyForm.vendorId)
    : null

  const vendorOptionsMissingSelection =
    counterpartyForm.vendorId && !selectedVendor && !vendorsError

  const modalTitle =
    editingEntry && editingEntry.mode === modalMode
      ? modalMode === 'customer'
        ? 'Edit customer number'
        : 'Edit counterparty contact'
      : modalMode === 'customer'
      ? 'New customer number'
      : 'New counterparty contact'

  const bulkActions = activeTab === 'counterparties' ? (
    <BulkActionsButton
      triggerLabel="Import / export contacts"
      title="Import or export counterparties"
      description="Upload vendor-side contacts in bulk or export the full list with their roles."
      note="CSV or Excel up to 5MB"
      columns={DIRECTORY_COUNTERPARTY_BULK_COLUMNS}
      downloadData={handleCounterpartyDataDownload}
      downloadTemplate={handleCounterpartyTemplateDownload}
      dataFallbackName="directory-counterparties.csv"
      templateFallbackName="directory-counterparties-template.csv"
      uploadConfig={{
        label: 'Upload CSV / Excel',
        onUpload: handleCounterpartyUpload,
        onComplete: loadDirectory
      }}
      className="inline-flex"
    />
  ) : (
    <BulkActionsButton
      triggerLabel="Import / export numbers"
      title="Import or export customer numbers"
      description="Upload trusted customer numbers in bulk or export everything for a call list."
      note="CSV or Excel up to 5MB"
      columns={DIRECTORY_CUSTOMER_BULK_COLUMNS}
      downloadData={handleCustomerDataDownload}
      downloadTemplate={handleCustomerTemplateDownload}
      dataFallbackName="directory-customers.csv"
      templateFallbackName="directory-customers-template.csv"
      uploadConfig={{
        label: 'Upload CSV / Excel',
        onUpload: handleCustomerUpload,
        onComplete: loadDirectory
      }}
      className="inline-flex"
    />
  )

  return (
    <DashboardLayout
      header={header}
      headerActions={<div className="flex flex-wrap items-center gap-3">{bulkActions}</div>}
    >
      <section className="rounded-[40px] border border-white/60 bg-white/80 p-6 shadow-[0_32px_70px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Directory</h2>
            <p className="text-sm text-slate-500">Bring order to vendor contacts and crucial customer lines.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold text-slate-500">
              <button
                type="button"
                onClick={() => setActiveTab('customers')}
                className={`rounded-full px-4 py-1 transition ${activeTab === 'customers' ? 'bg-white text-slate-900 shadow-sm' : ''}`}
              >
                Customer numbers
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('counterparties')}
                className={`rounded-full px-4 py-1 transition ${activeTab === 'counterparties' ? 'bg-white text-slate-900 shadow-sm' : ''}`}
              >
                Counterparties
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleNewEntryClick(activeTab === 'counterparties' ? 'counterparty' : 'customer')}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-2 text-xs font-semibold text-white shadow-lg transition hover:translate-y-[-1px]"
            >
              <Plus className="h-4 w-4" />
              {activeTab === 'counterparties' ? 'Add counterparty contact' : 'Save customer number'}
            </button>
          </div>
        </div>

        <div className="mt-6">
          {activeTab === 'counterparties' ? renderCounterparties() : renderCustomers()}
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="absolute inset-0" role="presentation" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">Directory entry</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                    {modalTitle}
                  </h2>
                </div>
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold text-slate-500">
                  <button
                    type="button"
                    onClick={() => handleNewEntryClick('customer')}
                    className={`rounded-full px-4 py-1 transition ${modalMode === 'customer' ? 'bg-white text-slate-900 shadow-sm' : ''}`}
                  >
                    Customer numbers
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNewEntryClick('counterparty')}
                    className={`rounded-full px-4 py-1 transition ${modalMode === 'counterparty' ? 'bg-white text-slate-900 shadow-sm' : ''}`}
                  >
                    Counterparties
                  </button>
                </div>
              </div>

              {modalMode === 'customer' ? (
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Name *
                    <input
                      type="text"
                      value={customerForm.name}
                      onChange={event => setCustomerForm(prev => ({ ...prev, name: event.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Number *
                    <input
                      type="tel"
                      value={customerForm.number}
                      onChange={event => setCustomerForm(prev => ({ ...prev, number: event.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Email
                    <input
                      type="email"
                      value={customerForm.email}
                      onChange={event => setCustomerForm(prev => ({ ...prev, email: event.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600 md:col-span-2">
                    Notes
                    <textarea
                      value={customerForm.notes}
                      onChange={event => setCustomerForm(prev => ({ ...prev, notes: event.target.value }))}
                      rows={3}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none"
                    />
                  </label>
                </div>
              ) : (
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Name *
                    <input
                      type="text"
                      value={counterpartyForm.name}
                      onChange={event => setCounterpartyForm(prev => ({ ...prev, name: event.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Phone *
                    <input
                      type="tel"
                      value={counterpartyForm.phone}
                      onChange={event => setCounterpartyForm(prev => ({ ...prev, phone: event.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Role / Function
                    <input
                      type="text"
                      value={counterpartyForm.role}
                      onChange={event => setCounterpartyForm(prev => ({ ...prev, role: event.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Linked vendor
                    <select
                      value={counterpartyForm.vendorId}
                      onChange={event => setCounterpartyForm(prev => ({ ...prev, vendorId: event.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none"
                    >
                      <option value="">No vendor link</option>
                      {vendorOptionsMissingSelection && (
                        <option value={counterpartyForm.vendorId}>
                          Linked vendor (inactive)
                        </option>
                      )}
                      {vendorOptions.map(option => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {vendorsError && (
                      <p className="mt-1 text-xs text-amber-600">{vendorsError}</p>
                    )}
                    {!vendorsError && vendorOptions.length === 0 && (
                      <p className="mt-1 text-xs text-slate-400">
                        Add vendors first to link contacts.
                      </p>
                    )}
                  </label>
                  <label className="text-xs font-semibold text-slate-600 md:col-span-2">
                    Email
                    <input
                      type="email"
                      value={counterpartyForm.email}
                      onChange={event => setCounterpartyForm(prev => ({ ...prev, email: event.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600 md:col-span-2">
                    Context / notes
                    <textarea
                      value={counterpartyForm.context}
                      onChange={event => setCounterpartyForm(prev => ({ ...prev, context: event.target.value }))}
                      rows={3}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none"
                    />
                  </label>
                </div>
              )}

              {modalError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600">
                  {modalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 transition hover:border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-2 text-xs font-semibold text-white shadow-lg transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Save entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

export default DirectoryPage
