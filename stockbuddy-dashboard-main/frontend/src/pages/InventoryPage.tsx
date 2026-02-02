import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Info as InfoIcon,
  LayoutGrid,
  Link2,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Save,
  Table,
  Trash2,
  Unlink,
  X
} from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import FixtureSearch from '../components/inventory/FixtureSearch'
import BulkActionsButton from '../components/BulkActionsButton'
import { useSession } from '../context/SessionContext'
import { useEvents } from '../context/EventsContext'
import { useCurrency } from '../context/CurrencyContext'
import {
  assignInventoryToOrderApi,
  completeSaleApi,
  createOrderRecord,
  createPurchaseRecord,
  deleteInventoryRecordApi,
  downloadInventoryCsv,
  fetchInventoryRecords,
  splitInventoryRecordApi,
  unassignSaleApi,
  updateInventoryRecordApi
} from '../api/inventory'
import {  cancelTransaction } from '../api/transactions'
import type {
  InventoryRecord,
  InventoryRecordStatus,
  InventoryRecordType,
  SeatAssignment
} from '../types/inventory'
import type { FixtureSearchSuggestion } from '../types/events'
import { fetchMembers } from '../api/members'
import { fetchVendors } from '../api/vendors'
import type { MemberListResponse } from '../types/members'
import type { VendorRecord } from '../types/vendors'
import { INVENTORY_EXPORT_COLUMNS } from '../constants/bulkColumns'
import type { ApiResult, DownloadPayload } from '../api/client'

type RecordFormValues = {
  quantity: string
  area: string
  block: string
  row: string
  seats: string
  age_group: string
  member_id: string
  bought_from: string
  bought_from_vendor_id: string
  cost: string
  order_number: string
  sold_to: string
  sold_to_vendor_id: string
  selling: string
  status: InventoryRecordStatus
  notes: string
}

type SeatAssignmentFormValue = {
  seat: string
  memberId: string
}

type TableRow = {
  record: InventoryRecord
  values: RecordFormValues
  seatAssignments: SeatAssignmentFormValue[]
  dirty: boolean
  saving: boolean
  error: string | null
  isDraft: boolean
  isEditing: boolean
}

const rowIsEditable = (row: TableRow): boolean => row.isDraft || row.isEditing

type AssignmentModalState =
  | null
  | {
      mode: 'inventory' | 'order'
      source: InventoryRecord
      showAll: boolean
    }

type SaleActionState =
  | null
  | {
      sale: InventoryRecord
      mode: 'complete' | 'unassign'
    }

type NoteModalState =
  | null
  | {
      record: InventoryRecord
      value: string
      saving: boolean
      error: string | null
    }

type CardNoteEntry = {
  value: string
  dirty: boolean
  saving: boolean
  error: string | null
}

type PurchaseFormValues = {
  quantity: string
  area: string
  block: string
  row: string
  age_group: string
  bought_from: string
  bought_from_vendor_id: string
  cost: string
  status: InventoryRecordStatus
}

type OrderFormValues = {
  quantity: string
  area: string
  block: string
  row: string
  seats: string
  age_group: string
  order_number: string
  sold_to: string
  sold_to_vendor_id: string
  selling: string
  status: InventoryRecordStatus
}

type FormMode = 'purchase' | 'order'

type SeatAssignmentEditorState =
  | null
  | {
      rowId: string
      quantity: number
      assignments: SeatAssignmentFormValue[]
    }

type SplitPartForm = {
  id: string
  quantity: string
  assignments: SeatAssignmentFormValue[]
}

type SplitModalState =
  | null
  | {
      record: InventoryRecord
      parts: SplitPartForm[]
      saving: boolean
      error: string | null
    }

const emptyPurchaseValues = (): PurchaseFormValues => ({
  quantity: '',
  area: '',
  block: '',
  row: '',
  age_group: '',
  bought_from: '',
  bought_from_vendor_id: '',
  cost: '',
  status: 'Available'
})

const emptyOrderValues = (): OrderFormValues => ({
  quantity: '',
  area: '',
  block: '',
  row: '',
  seats: '',
  age_group: '',
  order_number: '',
  sold_to: '',
  sold_to_vendor_id: '',
  selling: '',
  status: 'Unfulfilled'
})

const areaOptions = [
  'Shortside Upper',
  'Shortside Lower',
  'Shortside Hospitality',
  'Longside Hospitality',
  'Longside Upper',
  'Longside Upper Central',
  'Longside Lower',
  'Longside Lower Central'
]

const statusOrder: InventoryRecordStatus[] = ['Available', 'Unfulfilled', 'Reserved', 'Completed', 'Closed', 'Cancelled']
const statusBadgeClasses: Record<InventoryRecordStatus, string> = {
  Available: 'border border-orange-300 bg-orange-50 text-orange-800',
  Unfulfilled: 'border border-sky-300 bg-sky-100 text-sky-800',
  Reserved: 'border border-yellow-300 bg-yellow-50 text-yellow-800',
  Completed: 'border border-emerald-400 bg-emerald-50 text-emerald-800',
  Closed: 'border border-slate-300 bg-slate-100 text-slate-700',
  Cancelled: 'border border-rose-300 bg-rose-50 text-rose-800'
}

const statusSurfaceStyles: Record<InventoryRecordStatus, { rowBg: string; cardBg: string }> = {
  Available: {
    rowBg: 'bg-orange-50/80',
    cardBg: 'border-orange-200 bg-gradient-to-br from-white via-orange-50/80 to-white'
  },
  Unfulfilled: {
    rowBg: 'bg-sky-100/70',
    cardBg: 'border-sky-200 bg-gradient-to-br from-white via-sky-100/80 to-white'
  },
  Reserved: {
    rowBg: 'bg-yellow-50/80',
    cardBg: 'border-yellow-200 bg-gradient-to-br from-white via-yellow-50/80 to-white'
  },
  Completed: {
    rowBg: 'bg-emerald-100/60',
    cardBg: 'border-emerald-200 bg-gradient-to-br from-white via-emerald-100/60 to-white'
  },
  Closed: {
    rowBg: 'bg-slate-100/70',
    cardBg: 'border-slate-200 bg-gradient-to-br from-white via-slate-100/80 to-white'
  },
  Cancelled: {
    rowBg: 'bg-rose-100/70',
    cardBg: 'border-rose-200 bg-gradient-to-br from-white via-rose-100/80 to-white'
  }
}

const statusOptionsByType: Record<InventoryRecordType, InventoryRecordStatus[]> = {
  inventory: ['Available', 'Reserved', 'Completed', 'Closed', 'Cancelled'],
  order: ['Unfulfilled', 'Reserved', 'Completed', 'Closed', 'Cancelled'],
  sale: ['Reserved', 'Completed', 'Closed', 'Cancelled']
}

const lockedStatusOptions: Partial<Record<InventoryRecordStatus, InventoryRecordStatus[]>> = {
  Closed: ['Closed'],
  Completed: ['Completed']
}

const baseTableActionButtonClass =
  'inline-flex items-center justify-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-semibold transition-colors'
const tableActionButtonClasses = {
  neutral: `${baseTableActionButtonClass} border-slate-400 text-slate-600 hover:border-slate-700`,
  highlight: `${baseTableActionButtonClass} border-[#1d4ed8]/40 text-[#1d4ed8] hover:border-[#1d4ed8]/70`,
  success: `${baseTableActionButtonClass} border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300`,
  danger: `${baseTableActionButtonClass} border-rose-200 text-rose-600 hover:border-rose-300`
}

const baseCardActionButtonClass =
  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors'
const cardActionButtonClasses = {
  neutral: `${baseCardActionButtonClass} border-slate-200 text-slate-700 hover:border-slate-400`,
  highlight: `${baseCardActionButtonClass} border-[#1d4ed8]/40 text-[#1d4ed8] hover:border-[#1d4ed8]/70`,
  success: `${baseCardActionButtonClass} border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300`
}

const ensureSeatAssignmentLength = (
  assignments: SeatAssignmentFormValue[],
  quantity: number
): SeatAssignmentFormValue[] => {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return []
  }
  const normalized = assignments.slice(0, quantity)
  while (normalized.length < quantity) {
    normalized.push({ seat: '', memberId: '' })
  }
  return normalized
}

const mapRecordAssignments = (record: InventoryRecord): SeatAssignmentFormValue[] => {
  const base = record.seat_assignments ?? []
  const mapped = base.map(item => ({
    seat: item.seat_label ?? '',
    memberId: item.member_id ?? ''
  }))
  return ensureSeatAssignmentLength(mapped, record.quantity ?? mapped.length)
}

const toSeatAssignmentPayload = (assignments: SeatAssignmentFormValue[]): SeatAssignment[] => {
  return assignments.map(entry => ({
    seat_label: entry.seat.trim().length ? entry.seat.trim() : null,
    member_id: entry.memberId || null
  }))
}

const seatAssignmentsToString = (assignments: SeatAssignmentFormValue[]): string | null => {
  const seats = assignments
    .map(entry => entry.seat.trim())
    .filter(value => value.length)
  return seats.length ? seats.join(', ') : null
}

const formatSeatSummary = (assignments: SeatAssignmentFormValue[]): string => {
  return seatAssignmentsToString(assignments) ?? 'No seats'
}

const resolvePrimaryMemberFromAssignments = (assignments: SeatAssignmentFormValue[]): string | null => {
  for (const entry of assignments) {
    if (entry.memberId) {
      return entry.memberId
    }
  }
  return null
}

const cloneSeatAssignments = (assignments: SeatAssignmentFormValue[]): SeatAssignmentFormValue[] =>
  assignments.map(entry => ({ ...entry }))

const summarizeMemberNames = (
  assignments: SeatAssignmentFormValue[],
  memberOptions: Array<{ id: string; label: string }>
): string => {
  const labels = assignments
    .map(entry => memberOptions.find(option => option.id === entry.memberId)?.label)
    .filter((label): label is string => Boolean(label))
  return labels.length ? labels.join(', ') : 'No members'
}

const generatePartId = () => `part-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const createInitialSplitParts = (record: InventoryRecord): SplitPartForm[] => {
  const quantity = record.quantity
  if (quantity < 2) {
    return []
  }
  const firstQty = Math.max(1, Math.floor(quantity / 2))
  const secondQty = quantity - firstQty
  const assignments = mapRecordAssignments(record)
  const firstAssignments = assignments.slice(0, firstQty)
  const secondAssignments = assignments.slice(firstQty)
  return [
    {
      id: generatePartId(),
      quantity: String(firstQty),
      assignments: ensureSeatAssignmentLength(firstAssignments, firstQty)
    },
    {
      id: generatePartId(),
      quantity: String(secondQty),
      assignments: ensureSeatAssignmentLength(secondAssignments, secondQty)
    }
  ]
}

const InventoryPage = () => {
  const { token } = useSession()
  const { formatCurrency } = useCurrency()
  const authError = <T,>(): Promise<ApiResult<T>> =>
    Promise.resolve({ ok: false as const, error: 'Session expired. Please sign in again.', status: 401 })
  const { pinnedEvents, pinFixture, unpinFixture, isPinned } = useEvents()
  const location = useLocation()
  const [selectedFixture, setSelectedFixture] = useState<FixtureSearchSuggestion | null>(null)
  const [records, setRecords] = useState<InventoryRecord[]>([])
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [tableRows, setTableRows] = useState<TableRow[]>([])
  const updateRowState = useCallback(
    (rowId: string, updater: (row: TableRow) => TableRow) => {
      setTableRows(prev => prev.map(row => (row.record.id === rowId ? updater(row) : row)))
    },
    []
  )
  const [tableMessage, setTableMessage] = useState<string | null>(null)
  const [tableError, setTableError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'sheet' | 'cards'>('sheet')
  const [members, setMembers] = useState<MemberListResponse['data']>([])
  const [vendors, setVendors] = useState<VendorRecord[]>([])
  const [assignmentModal, setAssignmentModal] = useState<AssignmentModalState>(null)
  const [saleAction, setSaleAction] = useState<SaleActionState>(null)
  const [noteModal, setNoteModal] = useState<NoteModalState>(null)
  const [cancelModal, setCancelModal] = useState<InventoryRecord | null>(null)
  const [cancelModalError, setCancelModalError] = useState<string | null>(null)
  const [pinningFixture, setPinningFixture] = useState(false)
  const [formMode, setFormMode] = useState<FormMode | null>(null)
  const [formIntent, setFormIntent] = useState<'create' | 'edit'>('create')
  const [editingRecord, setEditingRecord] = useState<InventoryRecord | null>(null)
  const [purchaseValues, setPurchaseValues] = useState<PurchaseFormValues>(emptyPurchaseValues())
  const [purchaseSeatAssignments, setPurchaseSeatAssignments] = useState<SeatAssignmentFormValue[]>([])
  const [orderValues, setOrderValues] = useState<OrderFormValues>(emptyOrderValues())
  const [formError, setFormError] = useState<string | null>(null)
  const [formSaving, setFormSaving] = useState(false)
  const [autoAssignContext, setAutoAssignContext] = useState<{ inventoryId?: string; orderId?: string } | null>(null)
  const [seatEditor, setSeatEditor] = useState<SeatAssignmentEditorState>(null)
  const [splitModal, setSplitModal] = useState<SplitModalState>(null)
  const [cardNotes, setCardNotes] = useState<Record<string, CardNoteEntry>>({})
  const sheetFieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({})
  const highlightTimeoutRef = useRef<number | null>(null)
  const [highlightedFieldKey, setHighlightedFieldKey] = useState<string | null>(null)
  const tableErrorTimeoutRef = useRef<number | null>(null)
  const formErrorTimeoutRef = useRef<number | null>(null)
  useEffect(() => {
    setCardNotes(prev => {
      const next: Record<string, CardNoteEntry> = { ...prev }
      const recordIds = new Set(records.map(record => record.id))
      records.forEach(record => {
        const incoming = record.notes ?? ''
        const entry = next[record.id]
        if (!entry || (!entry.dirty && !entry.saving)) {
          next[record.id] = { value: incoming, dirty: false, saving: false, error: null }
        } else if (!entry.saving && !entry.dirty && entry.value !== incoming) {
          next[record.id] = { ...entry, value: incoming }
        }
      })
      Object.keys(next).forEach(id => {
        if (!recordIds.has(id)) {
          delete next[id]
        }
      })
      return next
    })
  }, [records])

  const memberOptions = useMemo(
    () => members.map(member => ({ id: member.id, label: member.name ?? member.email ?? 'Member' })),
    [members]
  )

  const vendorOptions = useMemo(
    () => vendors.map(vendor => ({ id: vendor.id, label: vendor.name })),
    [vendors]
  )

  const vendorOptionsWithFallback = useCallback(
    (currentId: string, fallbackLabel: string) => {
      if (!currentId) return vendorOptions
      if (vendorOptions.some(option => option.id === currentId)) {
        return vendorOptions
      }
      return [{ id: currentId, label: fallbackLabel || 'Unknown vendor' }, ...vendorOptions]
    },
    [vendorOptions]
  )

  const getStatusOptions = useCallback(
    (recordType: InventoryRecordType, currentStatus: InventoryRecordStatus) => {
      const base = statusOptionsByType[recordType] ?? statusOrder
      const locked = lockedStatusOptions[currentStatus]
      const options = locked ?? base
      if (!options.includes(currentStatus)) {
        return [currentStatus, ...options].filter((status, index, array) => array.indexOf(status) === index)
      }
      return options
    },
    []
  )

  const getStatusOptionsForRecord = useCallback(
    (record: InventoryRecord) => getStatusOptions(record.record_type, record.status),
    [getStatusOptions]
  )

  const getStatusOptionsForForm = useCallback(
    (mode: FormMode, currentStatus: InventoryRecordStatus) =>
      getStatusOptions(mode === 'purchase' ? 'inventory' : 'order', currentStatus),
    [getStatusOptions]
  )

  const resolvedFixture = useMemo(() => {
    if (selectedFixture) return selectedFixture
    const params = new URLSearchParams(location.search)
    const fromQuery = params.get('fixture_id')
    if (fromQuery) {
      const pinned = pinnedEvents.find(event => event.fixture_id === fromQuery)
      if (pinned) {
        return {
          id: pinned.fixture_id,
          home_team: pinned.home_team ?? 'Home',
          away_team: pinned.away_team ?? 'Away',
          date: pinned.event_date,
          home_logo: pinned.home_team_logo ?? pinned.home_logo ?? null,
          away_logo: pinned.away_team_logo ?? pinned.away_logo ?? null
        } satisfies FixtureSearchSuggestion
      }
    }
    return null
  }, [location.search, pinnedEvents, selectedFixture])

  const fixtureId = resolvedFixture?.id ?? null

  const handleInventoryDownload = useCallback(() => {
    if (!token) {
      return authError<DownloadPayload>()
    }
    return downloadInventoryCsv(token, {
      gameId: fixtureId ?? undefined
    })
  }, [fixtureId, token])

  const handleInventoryTemplateDownload = useCallback(() => {
    if (!token) {
      return authError<DownloadPayload>()
    }
    return downloadInventoryCsv(token, { template: true })
  }, [token])

  const focusField = useCallback((rowId: string, field: keyof RecordFormValues) => {
    const key = `${rowId}-${field}`
    const target = sheetFieldRefs.current[key]
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      target.focus()
    }
  }, [])

  const registerSheetField = useCallback(
    (rowId: string, field: keyof RecordFormValues) =>
      (element: HTMLInputElement | HTMLSelectElement | null) => {
        const key = `${rowId}-${field}`
        if (element) {
          sheetFieldRefs.current[key] = element
        } else {
          delete sheetFieldRefs.current[key]
        }
      },
    []
  )

  const highlightField = useCallback((rowId: string, field: keyof RecordFormValues) => {
    const key = `${rowId}-${field}`
    setHighlightedFieldKey(key)
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current)
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedFieldKey(current => (current === key ? null : current))
      highlightTimeoutRef.current = null
    }, 1600)
  }, [])

  const fieldHighlightClass = useCallback(
    (rowId: string, field: keyof RecordFormValues) =>
      highlightedFieldKey === `${rowId}-${field}`
        ? 'border-rose-500 bg-rose-50 ring-2 ring-rose-200 animate-pulse'
        : '',
    [highlightedFieldKey]
  )

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current)
      }
      if (tableErrorTimeoutRef.current) {
        window.clearTimeout(tableErrorTimeoutRef.current)
      }
      if (formErrorTimeoutRef.current) {
        window.clearTimeout(formErrorTimeoutRef.current)
      }
    }
  }, [])

  const setTimedTableError = useCallback((message: string | null) => {
    setTableError(message)
    if (tableErrorTimeoutRef.current) {
      window.clearTimeout(tableErrorTimeoutRef.current)
      tableErrorTimeoutRef.current = null
    }
    if (message) {
      tableErrorTimeoutRef.current = window.setTimeout(() => {
        setTableError(null)
        tableErrorTimeoutRef.current = null
      }, 3000)
    }
  }, [])

  const setTimedFormError = useCallback((message: string | null) => {
    setFormError(message)
    if (formErrorTimeoutRef.current) {
      window.clearTimeout(formErrorTimeoutRef.current)
      formErrorTimeoutRef.current = null
    }
    if (message) {
      formErrorTimeoutRef.current = window.setTimeout(() => {
        setFormError(null)
        formErrorTimeoutRef.current = null
      }, 3000)
    }
  }, [])

  const closeFormModal = useCallback(() => {
    setFormMode(null)
    setFormIntent('create')
    setEditingRecord(null)
    setPurchaseSeatAssignments([])
  }, [])

  const createRowFromRecord = useCallback(
    (record: InventoryRecord): TableRow => ({
      record,
      values: {
        quantity: record.quantity.toString(),
        area: record.area ?? '',
        block: record.block ?? '',
        row: record.row ?? '',
        seats: record.seats ?? '',
        age_group: record.age_group ?? '',
        member_id: record.member_id ?? '',
        bought_from: record.bought_from ?? '',
        bought_from_vendor_id: record.bought_from_vendor_id ?? '',
        cost: record.cost !== null ? String(record.cost) : '',
      order_number: record.order_number ?? '',
      sold_to: record.sold_to ?? '',
      sold_to_vendor_id: record.sold_to_vendor_id ?? '',
      selling: record.selling !== null ? String(record.selling) : '',
      status: record.status,
      notes: record.notes ?? ''
    },
      seatAssignments: mapRecordAssignments(record),
      dirty: false,
      saving: false,
      error: null,
      isDraft: false,
      isEditing: false
    }),
    []
  )

  const createDraftRow = useCallback(
    (recordType: InventoryRecordType, presets?: Partial<PurchaseFormValues & OrderFormValues>): TableRow => {
      const draftStatus: InventoryRecordStatus = recordType === 'inventory' ? 'Available' : 'Unfulfilled'
      const baseValues: RecordFormValues = {
        quantity: '',
        area: '',
        block: '',
        row: '',
        seats: '',
        age_group: '',
        member_id: '',
        bought_from: '',
        bought_from_vendor_id: '',
        cost: '',
      order_number: '',
      sold_to: '',
      sold_to_vendor_id: '',
      selling: '',
      status: draftStatus,
      notes: ''
    }
      if (presets) {
        Object.entries(presets).forEach(([key, value]) => {
          if (typeof value !== 'string') return
          if (Object.prototype.hasOwnProperty.call(baseValues, key)) {
            ;(baseValues as Record<string, string | InventoryRecordStatus>)[key] = value
          }
        })
      }
      const now = new Date().toISOString()
      return {
        record: {
          id: `draft-${recordType}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
          organization_id: 'draft',
          game_id: resolvedFixture?.id ?? null,
          record_type: recordType,
          status: draftStatus,
          quantity: 0,
          area: null,
          block: null,
          row: null,
          seats: null,
          seat_assignments: [],
          age_group: null,
          member_id: null,
          bought_from: null,
          bought_from_vendor_id: null,
          cost: null,
          order_number: null,
          sold_to: null,
          sold_to_vendor_id: null,
          selling: null,
          transaction_id: '',
          sale_id: null,
          source_inventory_id: null,
          source_order_id: null,
          notes: null,
          created_at: now,
          updated_at: now
        },
        values: baseValues,
        seatAssignments: [],
        dirty: true,
        saving: false,
        error: null,
        isDraft: true,
        isEditing: true
      }
    },
    [resolvedFixture]
  )

  const loadReferenceData = useCallback(async () => {
    if (!token) return
    try {
      const vendorsResult = await fetchVendors(token)
      if (vendorsResult.ok) {
        setVendors(vendorsResult.data.data.vendors)
      }
    } catch (error) {
      console.error(error)
    }
  }, [token])

  const loadRecords = useCallback(async () => {
    if (!token || !resolvedFixture) {
      setRecords([])
      setTableRows([])
      return
    }
    setLoadingRecords(true)
    setRecordsError(null)
    setTableMessage(null)
    try {
      const result = await fetchInventoryRecords(token, { gameId: resolvedFixture.id })
      if (!result.ok) {
        setRecordsError(result.error)
        setRecords([])
        setTableRows([])
        setLoadingRecords(false)
        return
      }
      setRecords(result.data.data)
      setTableRows(result.data.data.map(createRowFromRecord))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load inventory.'
      setRecordsError(message)
      setRecords([])
      setTableRows([])
    } finally {
      setLoadingRecords(false)
    }
  }, [createRowFromRecord, resolvedFixture, token])

  const handleToggleFixturePin = useCallback(async () => {
    if (!resolvedFixture || pinningFixture) return
    setPinningFixture(true)
    setTableError(null)
    setTableMessage(null)
    const alreadyPinned = isPinned(resolvedFixture.id)
    const result = alreadyPinned
      ? await unpinFixture(resolvedFixture.id)
      : await pinFixture(resolvedFixture.id)
    if (!result.ok) {
      setTableError(result.error)
    } else {
      setTableMessage(alreadyPinned ? 'Fixture unpinned.' : 'Fixture pinned.')
    }
    setPinningFixture(false)
  }, [isPinned, pinFixture, pinningFixture, resolvedFixture, setTableError, setTableMessage, unpinFixture])

  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  useEffect(() => {
    if (!token || !resolvedFixture) {
      setMembers([])
      return
    }

    const normalizedTeams = Array.from(
      new Set(
        [resolvedFixture.home_team, resolvedFixture.away_team]
          .map(team => (team ?? '').trim())
          .filter((team): team is string => Boolean(team))
      )
    )
    if (!normalizedTeams.length) {
      setMembers([])
      return
    }

    let cancelled = false
    const loadMembers = async () => {
      try {
        const result = await fetchMembers(token, { teamNames: normalizedTeams })
        if (cancelled) {
          return
        }
        if (result.ok) {
          setMembers(result.data.data)
        } else {
          setMembers([])
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setMembers([])
        }
      }
    }
    loadMembers()

    return () => {
      cancelled = true
    }
  }, [resolvedFixture, token])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const isVisibleRecord = useCallback((record: InventoryRecord) => {
    return record.record_type === 'sale' || !record.sale_id
  }, [])

  const visibleRecords = useMemo(() => records.filter(isVisibleRecord), [isVisibleRecord, records])
  const visibleTableRows = useMemo(
    () => tableRows.filter(row => isVisibleRecord(row.record)),
    [isVisibleRecord, tableRows]
  )

  const heroTotals = useMemo(() => {
    const aggregate = {
      quantity: 0,
      cost: 0,
      selling: 0,
      profit: 0
    }
    if (!resolvedFixture) {
      return aggregate
    }
    visibleRecords.forEach(record => {
      aggregate.quantity += record.quantity
      if (typeof record.cost === 'number') {
        aggregate.cost += record.cost
      }
      if (typeof record.selling === 'number') {
        aggregate.selling += record.selling
      }
      if (typeof record.cost === 'number' && typeof record.selling === 'number') {
        aggregate.profit += record.selling - record.cost
      }
    })
    return aggregate
  }, [resolvedFixture, visibleRecords])

  const handleTableValueChange = useCallback((recordId: string, field: keyof RecordFormValues, value: string) => {
    setTableRows(prev =>
      prev.map(row => {
        if (row.record.id !== recordId) return row
        if (!row.isDraft && !row.isEditing) {
          return row
        }
        const nextValues = {
          ...row.values,
          [field]: value
        }
        let nextAssignments = row.seatAssignments
        if (field === 'quantity' && row.record.record_type === 'inventory') {
          const nextQuantity = Number(value)
          nextAssignments = ensureSeatAssignmentLength(
            row.seatAssignments,
            Number.isFinite(nextQuantity) && nextQuantity > 0 ? nextQuantity : 0
          )
        }
        return {
          ...row,
          values: nextValues,
          seatAssignments: nextAssignments,
          dirty: true,
          error: null
        }
      })
    )
  }, [])

  const openSeatEditorForRow = useCallback((row: TableRow) => {
    if (!row.isDraft && !row.isEditing) {
      setTimedTableError('Click edit before updating seats for this row.')
      return
    }
    const editedQuantity = Number(row.values.quantity)
    const quantity =
      Number.isFinite(editedQuantity) && editedQuantity > 0 ? editedQuantity : row.record.quantity
    setSeatEditor({
      rowId: row.record.id,
      quantity,
      assignments: ensureSeatAssignmentLength(row.seatAssignments, quantity)
    })
  }, [setTimedTableError])

  const handleSeatEditorChange = useCallback((index: number, field: 'seat' | 'memberId', value: string) => {
    setSeatEditor(prev => {
      if (!prev || !prev.assignments[index]) return prev
      const nextAssignments = cloneSeatAssignments(prev.assignments)
      nextAssignments[index] = { ...nextAssignments[index], [field === 'seat' ? 'seat' : 'memberId']: value }
      return { ...prev, assignments: nextAssignments }
    })
  }, [])

  const handleSeatEditorSave = useCallback(() => {
    if (!seatEditor) return
    const normalized = ensureSeatAssignmentLength(seatEditor.assignments, seatEditor.quantity)
    setTableRows(prev =>
      prev.map(row => {
        if (row.record.id !== seatEditor.rowId) return row
        if (!row.isDraft && !row.isEditing) {
          return row
        }
        return {
          ...row,
          seatAssignments: normalized,
          values: {
            ...row.values,
            seats: seatAssignmentsToString(normalized) ?? row.values.seats,
            member_id: resolvePrimaryMemberFromAssignments(normalized) ?? row.values.member_id
          },
          dirty: true,
          error: null
        }
      })
    )
    setSeatEditor(null)
  }, [seatEditor])

  const handleSeatEditorCancel = useCallback(() => setSeatEditor(null), [])

  const openSplitModal = useCallback((record: InventoryRecord) => {
    if (record.quantity < 2) return
    setSplitModal({
      record,
      parts: createInitialSplitParts(record),
      saving: false,
      error: null
    })
  }, [])

  const openNoteModal = useCallback((record: InventoryRecord) => {
    setNoteModal({
      record,
      value: record.notes ?? '',
      saving: false,
      error: null
    })
  }, [])

  const handleNoteModalChange = useCallback((value: string) => {
    setNoteModal(prev => (prev ? { ...prev, value } : prev))
  }, [])

  const handleNoteModalSave = useCallback(async () => {
    if (!noteModal) return
    if (!token) {
      setNoteModal(prev => (prev ? { ...prev, error: 'Session expired. Please sign in again.' } : prev))
      return
    }
    const trimmed = noteModal.value.trim()
    setNoteModal(prev => (prev ? { ...prev, saving: true, error: null } : prev))
    const result = await updateInventoryRecordApi(token, noteModal.record.id, {
      notes: trimmed.length ? trimmed : null
    })
    if (!result.ok) {
      setNoteModal(prev => (prev ? { ...prev, saving: false, error: result.error } : prev))
      return
    }
    await loadRecords()
    setNoteModal(null)
  }, [noteModal, token, loadRecords])

  const updateCardNoteDraft = useCallback((recordId: string, value: string) => {
    setCardNotes(prev => {
      const existing = prev[recordId]
      return {
        ...prev,
        [recordId]: {
          value,
          dirty: true,
          saving: existing?.saving ?? false,
          error: null
        }
      }
    })
  }, [])

  const handleCardNoteSave = useCallback(
    async (recordId: string) => {
      const entry = cardNotes[recordId] ?? { value: '', dirty: false, saving: false, error: null }
      const value = entry.value ?? ''
      if (!token) {
        setCardNotes(prev => ({
          ...prev,
          [recordId]: { value, dirty: true, saving: false, error: 'Session expired. Please sign in again.' }
        }))
        return
      }
      setCardNotes(prev => ({
        ...prev,
        [recordId]: { ...(prev[recordId] ?? { value, dirty: false, error: null }), saving: true, error: null }
      }))
      const trimmed = value.trim()
      const result = await updateInventoryRecordApi(token, recordId, {
        notes: trimmed.length ? trimmed : null
      })
      if (!result.ok) {
        setCardNotes(prev => ({
          ...prev,
          [recordId]: {
            ...(prev[recordId] ?? { value, dirty: true, error: null }),
            saving: false,
            error: result.error,
            dirty: true
          }
        }))
        return
      }
      await loadRecords()
      setCardNotes(prev => ({
        ...prev,
        [recordId]: { value: trimmed, dirty: false, saving: false, error: null }
      }))
    },
    [cardNotes, token, loadRecords]
  )

  const handleVendorSelection = useCallback(
    (recordId: string, target: 'purchase' | 'order', vendorId: string) => {
      const vendor = vendorOptions.find(option => option.id === vendorId)
      setTableRows(prev =>
        prev.map(row => {
          if (row.record.id !== recordId) return row
          if (!row.isDraft && !row.isEditing) {
            return row
          }
          const nextValues = { ...row.values }
          if (target === 'purchase') {
            nextValues.bought_from_vendor_id = vendorId
            nextValues.bought_from = vendor?.label ?? ''
          } else {
            nextValues.sold_to_vendor_id = vendorId
            nextValues.sold_to = vendor?.label ?? ''
          }
          return { ...row, values: nextValues, dirty: true, error: null }
        })
      )
    },
    [vendorOptions]
  )

  const isFieldEditable = (record: InventoryRecord, field: keyof RecordFormValues): boolean => {
    if (record.record_type === 'sale') return false
    if (record.record_type === 'inventory') {
      if (field === 'seats' || field === 'member_id') {
        return false
      }
      return !['order_number', 'sold_to', 'sold_to_vendor_id', 'selling'].includes(field)
    }
    if (record.record_type === 'order') {
      return !['bought_from', 'bought_from_vendor_id', 'cost'].includes(field)
    }
    return true
  }

  const requiredFields: Record<InventoryRecordType, Array<keyof RecordFormValues>> = {
    inventory: ['quantity', 'area', 'bought_from_vendor_id', 'bought_from', 'cost'],
    order: ['quantity', 'area', 'sold_to_vendor_id', 'sold_to', 'selling'],
    sale: []
  }

  const normalizeNumber = (value: string): number | null => {
    const trimmed = value.trim()
    if (!trimmed.length) return null
    const parsed = Number(trimmed)
    return Number.isNaN(parsed) ? null : parsed
  }

  const validateRow = (row: TableRow): { ok: boolean; message?: string; field?: keyof RecordFormValues } => {
    if (row.record.record_type === 'sale') {
      return { ok: true }
    }
    const fields = requiredFields[row.record.record_type]
    for (const field of fields) {
      const value = row.values[field]
      if (!value || !value.trim().length) {
        return { ok: false, message: `${field.replace('_', ' ')} is required.`, field }
      }
    }
    return { ok: true }
  }

  const buildUpdatePayload = (row: TableRow) => {
    const payload: Record<string, unknown> = {}
    const compareField = (field: keyof RecordFormValues, normalize: (value: string) => any = value => value.trim().length ? value.trim() : null) => {
      const next = normalize(row.values[field])
      const current = field === 'quantity' ? row.record.quantity : (row.record as any)[field]
      if (field === 'quantity') {
        const asNumber = Number(row.values.quantity)
        if (!Number.isNaN(asNumber) && asNumber !== row.record.quantity) {
          payload.quantity = asNumber
        }
        return
      }
      if (field === 'status') {
        if (row.values.status !== row.record.status) {
          payload.status = row.values.status
        }
        return
      }
      if ((current ?? null) !== (next ?? null)) {
        payload[field] = next
      }
    }

    compareField('area')
    compareField('block')
    compareField('row')
    if (row.record.record_type !== 'inventory') {
      compareField('seats')
    }
    compareField('age_group')
    if (row.record.record_type !== 'inventory') {
      compareField('member_id')
    }
    compareField('bought_from')
    compareField('bought_from_vendor_id')
    compareField('cost', value => normalizeNumber(value))
    compareField('order_number')
    compareField('sold_to')
    compareField('sold_to_vendor_id')
    compareField('selling', value => normalizeNumber(value))
    compareField('notes')
    compareField('status')

    if (row.record.record_type === 'inventory' && row.seatAssignments.length) {
      const originalAssignments = mapRecordAssignments(row.record)
      const changed =
        originalAssignments.length !== row.seatAssignments.length ||
        row.seatAssignments.some(
          (assignment, index) =>
            assignment.seat !== (originalAssignments[index]?.seat ?? '') ||
            assignment.memberId !== (originalAssignments[index]?.memberId ?? '')
        )
      if (changed) {
        payload.seat_assignments = toSeatAssignmentPayload(row.seatAssignments)
        payload.seats = seatAssignmentsToString(row.seatAssignments)
        payload.member_id = resolvePrimaryMemberFromAssignments(row.seatAssignments)
      }
    }

    return payload
  }

  const optionalText = (value: string) => {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }

  const buildCreatePayload = (row: TableRow, gameId: string) => {
    const quantity = normalizeNumber(row.values.quantity)
    if (quantity === null) return null
    if (row.record.record_type === 'inventory') {
      const cost = normalizeNumber(row.values.cost)
      if (cost === null) return null
      if (!row.values.bought_from_vendor_id.trim()) return null
      const assignments = ensureSeatAssignmentLength(row.seatAssignments, quantity)
      return {
        type: 'inventory' as const,
        payload: {
          game_id: gameId,
          quantity,
          area: row.values.area.trim(),
          block: optionalText(row.values.block),
          row: optionalText(row.values.row),
          seats: seatAssignmentsToString(assignments),
          seat_assignments: toSeatAssignmentPayload(assignments),
          age_group: optionalText(row.values.age_group),
          member_id: resolvePrimaryMemberFromAssignments(assignments),
          bought_from: row.values.bought_from.trim(),
          bought_from_vendor_id: row.values.bought_from_vendor_id.trim(),
          cost,
          status: row.values.status
        }
      }
    }
    if (row.record.record_type === 'order') {
      const selling = normalizeNumber(row.values.selling)
      if (selling === null) return null
      if (!row.values.sold_to_vendor_id.trim()) return null
      return {
        type: 'order' as const,
        payload: {
          game_id: gameId,
          quantity,
          area: row.values.area.trim(),
          block: optionalText(row.values.block),
          row: optionalText(row.values.row),
          seats: optionalText(row.values.seats),
          age_group: optionalText(row.values.age_group),
          order_number: optionalText(row.values.order_number),
          sold_to: row.values.sold_to.trim(),
          sold_to_vendor_id: row.values.sold_to_vendor_id.trim(),
          selling,
          status: row.values.status
        }
      }
    }
    return null
  }

  const computeRowProfit = (values: RecordFormValues): number | null => {
    const quantity = normalizeNumber(values.quantity)
    const cost = normalizeNumber(values.cost)
    const selling = normalizeNumber(values.selling)
    if (quantity === null || cost === null || selling === null) return null
    const total = (selling - cost) * quantity
    return Number.isFinite(total) ? total : null
  }

  const toggleRowEditing = useCallback(
    (rowId: string, editing: boolean) => {
      updateRowState(rowId, row => {
        if (row.isDraft) {
          return row
        }
        if (!editing) {
          const reset = createRowFromRecord(row.record)
          return {
            ...row,
            values: reset.values,
            seatAssignments: reset.seatAssignments,
            dirty: false,
            isEditing: false,
            error: null
          }
        }
        return { ...row, isEditing: true, error: null }
      })
    },
    [createRowFromRecord, updateRowState]
  )

  const handleSaveRow = useCallback(
    async (row: TableRow) => {
      if (!token) return
      setTableMessage(null)
      setTableError(null)
      const validation = validateRow(row)
      if (!validation.ok && validation.field) {
        setTimedTableError(validation.message ?? 'Invalid data.')
        focusField(row.record.id, validation.field)
        highlightField(row.record.id, validation.field)
        return
      }
      updateRowState(row.record.id, current => ({ ...current, saving: true, error: null }))
      try {
        if (row.isDraft) {
          const gameId = row.record.game_id ?? resolvedFixture?.id
          if (!gameId) {
            setTimedTableError('Select a fixture before saving new records.')
            updateRowState(row.record.id, current => ({ ...current, saving: false }))
            return
          }
          const draftPayload = buildCreatePayload(row, gameId)
          if (!draftPayload) {
            setTimedTableError('Unable to save record. Please review the inputs.')
            updateRowState(row.record.id, current => ({ ...current, saving: false }))
            return
          }
          if (draftPayload.type === 'inventory') {
            const result = await createPurchaseRecord(token, draftPayload.payload)
            if (!result.ok) {
              setTimedTableError(result.error)
              updateRowState(row.record.id, current => ({ ...current, saving: false }))
              return
            }
            const created = result.data.data
            if (autoAssignContext?.orderId) {
              const assignment = await assignInventoryToOrderApi(token, {
                inventoryId: created.id,
                orderId: autoAssignContext.orderId
              })
              if (!assignment.ok) {
                setTimedTableError(assignment.error)
                updateRowState(row.record.id, current => ({ ...current, saving: false }))
                return
              }
              setAutoAssignContext(null)
            }
          } else {
            const result = await createOrderRecord(token, draftPayload.payload)
            if (!result.ok) {
              setTimedTableError(result.error)
              updateRowState(row.record.id, current => ({ ...current, saving: false }))
              return
            }
            const created = result.data.data
            if (autoAssignContext?.inventoryId) {
              const assignment = await assignInventoryToOrderApi(token, {
                inventoryId: autoAssignContext.inventoryId,
                orderId: created.id
              })
              if (!assignment.ok) {
                setTimedTableError(assignment.error)
                updateRowState(row.record.id, current => ({ ...current, saving: false }))
                return
              }
              setAutoAssignContext(null)
            }
          }
        } else {
          const payload = buildUpdatePayload(row)
          if (!Object.keys(payload).length) {
            setTableMessage('No changes to save for this row.')
            updateRowState(row.record.id, current => ({ ...current, saving: false, isEditing: false, dirty: false }))
            return
          }
          const result = await updateInventoryRecordApi(token, row.record.id, payload)
          if (!result.ok) {
            setTimedTableError(result.error)
            updateRowState(row.record.id, current => ({ ...current, saving: false }))
            return
          }
        }
        await loadRecords()
        setTableMessage(row.isDraft ? 'Record created.' : 'Record updated.')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save record.'
        setTimedTableError(message)
        updateRowState(row.record.id, current => ({ ...current, saving: false }))
      }
    },
    [
      autoAssignContext,
      focusField,
      highlightField,
      loadRecords,
      resolvedFixture,
      setTimedTableError,
      token,
      updateRowState
    ]
  )

  const handleDeleteRecord = useCallback(
    async (record: InventoryRecord) => {
      if (!token) return
      setCancelModalError(null)
      try {
        await deleteInventoryRecordApi(token, record.id)
        const txResult = await cancelTransaction(token, record.transaction_id)
        if (!txResult.ok) {
          setTableError(txResult.error)
        } else {
          setTableError(null)
        }
        setTableMessage(record.record_type === 'inventory' ? 'Inventory cancelled.' : 'Order cancelled.')
        setCancelModal(null)
        await loadRecords()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to delete record.'
        setCancelModalError(message)
        setTableError(message)
      }
    },
    [loadRecords, token]
  )

  const handleRemoveDraftRow = useCallback(
    (row: TableRow) => {
      setTableRows(prev => prev.filter(candidate => candidate.record.id !== row.record.id))
      if (autoAssignContext?.inventoryId && row.record.record_type === 'order') {
        setAutoAssignContext(null)
      }
      if (autoAssignContext?.orderId && row.record.record_type === 'inventory') {
        setAutoAssignContext(null)
      }
    },
    [autoAssignContext]
  )

  const suggestions = useMemo(() => {
    const availableInventory = records.filter(record => record.record_type === 'inventory' && record.status === 'Available')
    const unfulfilledOrders = records.filter(record => record.record_type === 'order' && record.status === 'Unfulfilled')
    return { availableInventory, unfulfilledOrders }
  }, [records])

  const filteredSuggestions = (source: InventoryRecord, showAll: boolean) => {
    if (source.record_type === 'inventory') {
      const base = showAll ? suggestions.unfulfilledOrders : suggestions.unfulfilledOrders.filter(order => {
        if (order.area && source.area && order.area !== source.area) return false
        if (order.quantity !== source.quantity) return false
        if (order.seats && source.seats && order.seats !== source.seats) return false
        return true
      })
      return base
    }
    const base = showAll ? suggestions.availableInventory : suggestions.availableInventory.filter(item => {
      if (item.area && source.area && item.area !== source.area) return false
      if (item.quantity !== source.quantity) return false
      if (item.seats && source.seats && item.seats !== source.seats) return false
      return true
    })
    return base
  }

  const handleAssignment = useCallback(
    async (inventoryId: string, orderId: string) => {
      if (!token) return
      try {
        await assignInventoryToOrderApi(token, { inventoryId, orderId })
        setAssignmentModal(null)
        await loadRecords()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to assign inventory.'
        setRecordsError(message)
      }
    },
    [loadRecords, token]
  )

  const handleSaleAction = useCallback(
    async (action: SaleActionState) => {
      if (!token || !action) return
      try {
        if (action.mode === 'complete') {
          await completeSaleApi(token, action.sale.id)
        } else {
          await unassignSaleApi(token, action.sale.id)
        }
        await loadRecords()
        setSaleAction(null)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to update sale.'
        setRecordsError(message)
      }
    },
    [loadRecords, token]
  )

  const openForm = (mode: FormMode, presets?: Partial<PurchaseFormValues & OrderFormValues>) => {
    setFormIntent('create')
    setEditingRecord(null)
    if (viewMode === 'sheet') {
      if (!resolvedFixture) {
        setTableError('Select a fixture before logging records.')
        return
      }
      setTableError(null)
      setTableMessage(null)
      const draftRow = createDraftRow(mode === 'purchase' ? 'inventory' : 'order', presets)
      setTableRows(prev => [draftRow, ...prev])
      if (typeof window !== 'undefined') {
        window.setTimeout(() => focusField(draftRow.record.id, 'quantity'), 0)
      }
      return
    }
    setFormMode(mode)
    setFormError(null)
    if (mode === 'purchase') {
      setPurchaseValues(prev => ({ ...emptyPurchaseValues(), ...presets }))
      const presetQuantity =
        presets && typeof presets.quantity === 'string' ? Number(presets.quantity) : NaN
      setPurchaseSeatAssignments(
        ensureSeatAssignmentLength([], Number.isFinite(presetQuantity) && presetQuantity > 0 ? presetQuantity : 0)
      )
    } else {
      setOrderValues(prev => ({ ...emptyOrderValues(), ...presets }))
    }
  }

  const openEditForm = useCallback(
    (record: InventoryRecord) => {
      if (record.record_type !== 'inventory' && record.record_type !== 'order') {
        return
      }
      setFormIntent('edit')
      setEditingRecord(record)
      setFormError(null)
      const mode: FormMode = record.record_type === 'inventory' ? 'purchase' : 'order'
      setFormMode(mode)
      if (mode === 'purchase') {
        setPurchaseValues({
          quantity: record.quantity.toString(),
          area: record.area ?? '',
          block: record.block ?? '',
          row: record.row ?? '',
          age_group: record.age_group ?? '',
          bought_from: record.bought_from ?? '',
          bought_from_vendor_id: record.bought_from_vendor_id ?? '',
          cost: record.cost !== null ? String(record.cost) : '',
          status: record.status
        })
        setPurchaseSeatAssignments(mapRecordAssignments(record))
      } else {
        setOrderValues({
          quantity: record.quantity.toString(),
          area: record.area ?? '',
          block: record.block ?? '',
          row: record.row ?? '',
          seats: record.seats ?? '',
          age_group: record.age_group ?? '',
          order_number: record.order_number ?? '',
          sold_to: record.sold_to ?? '',
          sold_to_vendor_id: record.sold_to_vendor_id ?? '',
          selling: record.selling !== null ? String(record.selling) : '',
          status: record.status
        })
      }
    },
    []
  )

  const handleFormChange = (mode: FormMode, field: keyof PurchaseFormValues | keyof OrderFormValues, value: string) => {
    if (mode === 'purchase') {
      setPurchaseValues(prev => ({ ...prev, [field]: field === 'status' ? (value as InventoryRecordStatus) : value }))
      if (field === 'quantity') {
        const nextCount = Number(value)
        setPurchaseSeatAssignments(prev =>
          ensureSeatAssignmentLength(prev, Number.isFinite(nextCount) && nextCount > 0 ? nextCount : 0)
        )
      }
    } else {
      setOrderValues(prev => ({ ...prev, [field]: field === 'status' ? (value as InventoryRecordStatus) : value }))
    }
  }

  const handleFormVendorSelection = (mode: FormMode, vendorId: string) => {
    const vendor = vendorOptions.find(option => option.id === vendorId)
    if (mode === 'purchase') {
      setPurchaseValues(prev => ({
        ...prev,
        bought_from_vendor_id: vendorId,
        bought_from: vendor?.label ?? ''
      }))
    } else {
      setOrderValues(prev => ({
        ...prev,
        sold_to_vendor_id: vendorId,
        sold_to: vendor?.label ?? ''
      }))
    }
  }

  const handlePurchaseAssignmentChange = useCallback(
    (index: number, field: 'seat' | 'memberId', value: string) => {
      setPurchaseSeatAssignments(prev => {
        if (!prev[index]) return prev
        const next = cloneSeatAssignments(prev)
        next[index] = { ...next[index], [field === 'seat' ? 'seat' : 'memberId']: value }
        return next
      })
    },
    []
  )

  const handleSubmitForm = async () => {
    if (!formMode || !token) return
    setFormError(null)
    setFormSaving(true)
    try {
      if (formIntent === 'edit' && editingRecord) {
        if (formMode === 'purchase') {
          if (
            !purchaseValues.quantity.trim() ||
            !purchaseValues.area.trim() ||
            !purchaseValues.bought_from.trim() ||
            !purchaseValues.bought_from_vendor_id.trim() ||
            !purchaseValues.cost.trim()
          ) {
            setFormError('Quantity, Area, CounterParty, and Cost are required.')
            setFormSaving(false)
            return
          }
          const quantityValue = Number(purchaseValues.quantity)
          if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
            setFormError('Quantity must be a positive number.')
            setFormSaving(false)
            return
          }
          const normalizedAssignments = ensureSeatAssignmentLength(purchaseSeatAssignments, quantityValue)
          const payloadAssignments = toSeatAssignmentPayload(normalizedAssignments)
          const seatsString = seatAssignmentsToString(normalizedAssignments)
          const primaryMemberId = resolvePrimaryMemberFromAssignments(normalizedAssignments)
          const payload = {
            quantity: quantityValue,
            area: purchaseValues.area.trim(),
            block: purchaseValues.block || null,
            row: purchaseValues.row || null,
            seats: seatsString,
            seat_assignments: payloadAssignments,
            age_group: purchaseValues.age_group || null,
            member_id: primaryMemberId,
            bought_from: purchaseValues.bought_from.trim(),
            bought_from_vendor_id: purchaseValues.bought_from_vendor_id.trim(),
            cost: Number(purchaseValues.cost),
            status: purchaseValues.status
          }
          const result = await updateInventoryRecordApi(token, editingRecord.id, payload)
          if (!result.ok) {
            setFormError(result.error)
            setFormSaving(false)
            return
          }
        } else {
          if (
            !orderValues.quantity.trim() ||
            !orderValues.area.trim() ||
            !orderValues.sold_to.trim() ||
            !orderValues.sold_to_vendor_id.trim() ||
            !orderValues.selling.trim()
          ) {
            setFormError('Quantity, Area, CounterParty, and Selling are required.')
            setFormSaving(false)
            return
          }
          const payload = {
            quantity: Number(orderValues.quantity),
            area: orderValues.area.trim(),
            block: orderValues.block || null,
            row: orderValues.row || null,
            seats: orderValues.seats || null,
            age_group: orderValues.age_group || null,
            order_number: orderValues.order_number || null,
            sold_to: orderValues.sold_to.trim(),
            sold_to_vendor_id: orderValues.sold_to_vendor_id.trim(),
            selling: Number(orderValues.selling),
            status: orderValues.status
          }
          const result = await updateInventoryRecordApi(token, editingRecord.id, payload)
          if (!result.ok) {
            setFormError(result.error)
            setFormSaving(false)
            return
          }
        }
        await loadRecords()
        if (formMode === 'purchase') {
          setPurchaseValues(emptyPurchaseValues())
        } else {
          setOrderValues(emptyOrderValues())
        }
        closeFormModal()
        setFormSaving(false)
        return
      }

      if (!resolvedFixture) {
        setFormError('Select a fixture before saving.')
        setFormSaving(false)
        return
      }

      if (formMode === 'purchase') {
        if (
          !purchaseValues.quantity.trim() ||
          !purchaseValues.area.trim() ||
          !purchaseValues.bought_from.trim() ||
          !purchaseValues.bought_from_vendor_id.trim() ||
          !purchaseValues.cost.trim()
        ) {
          setFormError('Quantity, Area, CounterParty, and Cost are required.')
          setFormSaving(false)
          return
        }
        const quantityValue = Number(purchaseValues.quantity)
        if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
          setFormError('Quantity must be a positive number.')
          setFormSaving(false)
          return
        }
        const normalizedAssignments = ensureSeatAssignmentLength(purchaseSeatAssignments, quantityValue)
        const payloadAssignments = toSeatAssignmentPayload(normalizedAssignments)
        const seatsString = seatAssignmentsToString(normalizedAssignments)
        const primaryMemberId = resolvePrimaryMemberFromAssignments(normalizedAssignments)
        const payload = {
          game_id: resolvedFixture.id,
          quantity: quantityValue,
          area: purchaseValues.area.trim(),
          block: purchaseValues.block || null,
          row: purchaseValues.row || null,
          seats: seatsString,
          seat_assignments: payloadAssignments,
          age_group: purchaseValues.age_group || null,
          member_id: primaryMemberId,
          bought_from: purchaseValues.bought_from.trim(),
          bought_from_vendor_id: purchaseValues.bought_from_vendor_id.trim(),
          cost: Number(purchaseValues.cost),
          status: purchaseValues.status
        }
        const result = await createPurchaseRecord(token, payload)
        if (!result.ok) {
          setFormError(result.error)
          setFormSaving(false)
          return
        }
        const created = result.data.data
        closeFormModal()
        setPurchaseValues(emptyPurchaseValues())
        await loadRecords()
        if (autoAssignContext?.orderId) {
          await handleAssignment(created.id, autoAssignContext.orderId)
          setAutoAssignContext(null)
        }
      } else {
        if (
          !orderValues.quantity.trim() ||
          !orderValues.area.trim() ||
          !orderValues.sold_to.trim() ||
          !orderValues.sold_to_vendor_id.trim() ||
          !orderValues.selling.trim()
        ) {
          setFormError('Quantity, Area, CounterParty, and Selling are required.')
          setFormSaving(false)
          return
        }
        const payload = {
          game_id: resolvedFixture.id,
          quantity: Number(orderValues.quantity),
          area: orderValues.area.trim(),
          block: orderValues.block || null,
          row: orderValues.row || null,
          seats: orderValues.seats || null,
          age_group: orderValues.age_group || null,
          order_number: orderValues.order_number || null,
          sold_to: orderValues.sold_to.trim(),
          sold_to_vendor_id: orderValues.sold_to_vendor_id.trim(),
          selling: Number(orderValues.selling),
          status: orderValues.status
        }
        const result = await createOrderRecord(token, payload)
        if (!result.ok) {
          setFormError(result.error)
          setFormSaving(false)
          return
        }
        const created = result.data.data
        closeFormModal()
        setOrderValues(emptyOrderValues())
        await loadRecords()
        if (autoAssignContext?.inventoryId) {
          await handleAssignment(autoAssignContext.inventoryId, created.id)
          setAutoAssignContext(null)
        }
      }
      setFormSaving(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save.'
      setFormError(message)
      setFormSaving(false)
    }
  }

  const renderTable = () => (
    <div className="mt-6 rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
          <Table className="h-4 w-4 text-[#1d4ed8]" />
          Sheet view
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-600">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              <th className="px-3 py-3">Quantity</th>
              <th className="px-3 py-3">Area</th>
              <th className="px-3 py-3">Block</th>
              <th className="px-3 py-3">Row</th>
              <th className="px-3 py-3 w-[100px] min-w-[100px]">Seat</th>
              <th className="px-3 py-3">Age group</th>
              <th className="px-3 py-3 w-[170px] min-w-[170px]">Member</th>
              <th className="px-3 py-3">Bought from</th>
              <th className="px-3 py-3">Sold to</th>
              <th className="px-3 py-3">Order #</th>
              <th className="px-3 py-3">Total Cost</th>
              <th className="px-3 py-3">Total Selling</th>
              <th className="px-3 py-3">Total Profit</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Notes</th>
              <th className="px-3 py-3 w-[180px] min-w-[150px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleTableRows.map(row => {
                const profitValue = computeRowProfit(row.values)
                const statusBadge = statusBadgeClasses[row.values.status] ?? statusBadgeClasses.Available
                const surface = statusSurfaceStyles[row.values.status] ?? statusSurfaceStyles.Available
                return (
                  <tr key={row.record.id} className={`border-b border-slate-100 ${surface.rowBg}`}>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min={0}
                        ref={registerSheetField(row.record.id, 'quantity')}
                        className={`w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm ${fieldHighlightClass(row.record.id, 'quantity')}`}
                        value={row.values.quantity}
                        disabled={!rowIsEditable(row) || !isFieldEditable(row.record, 'quantity')}
                        onChange={event => handleTableValueChange(row.record.id, 'quantity', event.target.value)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="w-32">
                        <input
                          type="text"
                          list="inventory-area-options"
                          ref={registerSheetField(row.record.id, 'area')}
                          className={`w-full rounded-lg border border-slate-200 px-3 py-2 text-sm ${fieldHighlightClass(row.record.id, 'area')}`}
                          value={row.values.area}
                          disabled={!rowIsEditable(row) || !isFieldEditable(row.record, 'area')}
                          placeholder="Area"
                          onChange={event => handleTableValueChange(row.record.id, 'area', event.target.value)}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        ref={registerSheetField(row.record.id, 'block')}
                        className={`w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm ${fieldHighlightClass(row.record.id, 'block')}`}
                        value={row.values.block}
                        disabled={!rowIsEditable(row) || !isFieldEditable(row.record, 'block')}
                        onChange={event => handleTableValueChange(row.record.id, 'block', event.target.value)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        ref={registerSheetField(row.record.id, 'row')}
                        className={`w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm ${fieldHighlightClass(row.record.id, 'row')}`}
                        value={row.values.row}
                        disabled={!rowIsEditable(row) || !isFieldEditable(row.record, 'row')}
                        onChange={event => handleTableValueChange(row.record.id, 'row', event.target.value)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      {row.record.record_type === 'inventory' ? (
                        <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-700">{formatSeatSummary(row.seatAssignments)}</p>
                      <button
                        type="button"
                        onClick={() => openSeatEditorForRow(row)}
                        disabled={!row.isDraft && !row.isEditing}
                        className={`text-xs font-semibold ${
                          !row.isDraft && !row.isEditing
                            ? 'text-slate-400'
                            : 'text-[#1d4ed8] hover:underline'
                        }`}
                      >
                        Manage seats
                      </button>
                    </div>
                      ) : (
                        <input
                          type="text"
                          ref={registerSheetField(row.record.id, 'seats')}
                          className={`w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm ${fieldHighlightClass(row.record.id, 'seats')}`}
                          value={row.values.seats}
                          disabled={!rowIsEditable(row) || !isFieldEditable(row.record, 'seats')}
                          onChange={event => handleTableValueChange(row.record.id, 'seats', event.target.value)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        ref={registerSheetField(row.record.id, 'age_group')}
                        className={`w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm ${fieldHighlightClass(row.record.id, 'age_group')}`}
                        value={row.values.age_group}
                        disabled={!rowIsEditable(row) || !isFieldEditable(row.record, 'age_group')}
                        onChange={event => handleTableValueChange(row.record.id, 'age_group', event.target.value)}
                      />
                    </td>
                    <td className="px-3 py-3 w-[170px] min-w-[170px]">
                      {row.record.record_type === 'inventory' || row.record.record_type === 'sale' ? (
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-700">
                            {summarizeMemberNames(row.seatAssignments, memberOptions)}
                          </p>
                          {row.record.record_type === 'inventory' && (
                            <button
                              type="button"
                              onClick={() => openSeatEditorForRow(row)}
                              disabled={!row.isDraft && !row.isEditing}
                              className={`text-xs font-semibold ${
                                !row.isDraft && !row.isEditing
                                  ? 'text-slate-400'
                                  : 'text-[#1d4ed8] hover:underline'
                              }`}
                            >
                              Manage members
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-500">Not available</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="relative w-40">
                        <select
                          ref={registerSheetField(row.record.id, 'bought_from_vendor_id')}
                          className={`w-full appearance-none rounded-lg border border-slate-200 px-3 py-2 pr-8 text-sm ${fieldHighlightClass(row.record.id, 'bought_from_vendor_id')}`}
                          value={row.values.bought_from_vendor_id}
                          disabled={!rowIsEditable(row) || !isFieldEditable(row.record, 'bought_from')}
                          onChange={event => handleVendorSelection(row.record.id, 'purchase', event.target.value)}
                        >
                          <option value="">
                            {row.values.bought_from_vendor_id ? 'Select CounterParty' : row.values.bought_from || 'Select CounterParty'}
                          </option>
                          {vendorOptionsWithFallback(row.values.bought_from_vendor_id, row.values.bought_from).map(option => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="relative w-40">
                        <select
                          ref={registerSheetField(row.record.id, 'sold_to_vendor_id')}
                          className={`w-full appearance-none rounded-lg border border-slate-200 px-3 py-2 pr-8 text-sm ${fieldHighlightClass(row.record.id, 'sold_to_vendor_id')}`}
                          value={row.values.sold_to_vendor_id}
                          disabled={!rowIsEditable(row) || !isFieldEditable(row.record, 'sold_to')}
                          onChange={event => handleVendorSelection(row.record.id, 'order', event.target.value)}
                        >
                          <option value="">
                            {row.values.sold_to_vendor_id ? 'Select CounterParty' : row.values.sold_to || 'Select CounterParty'}
                          </option>
                          {vendorOptionsWithFallback(row.values.sold_to_vendor_id, row.values.sold_to).map(option => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        ref={registerSheetField(row.record.id, 'order_number')}
                        className={`w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm ${fieldHighlightClass(row.record.id, 'order_number')}`}
                        value={row.values.order_number}
                        disabled={!rowIsEditable(row) || !isFieldEditable(row.record, 'order_number')}
                        onChange={event => handleTableValueChange(row.record.id, 'order_number', event.target.value)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        step="0.01"
                        ref={registerSheetField(row.record.id, 'cost')}
                        className={`w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm ${fieldHighlightClass(row.record.id, 'cost')}`}
                        value={row.values.cost}
                        disabled={!rowIsEditable(row) || !isFieldEditable(row.record, 'cost')}
                        onChange={event => handleTableValueChange(row.record.id, 'cost', event.target.value)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        step="0.01"
                        ref={registerSheetField(row.record.id, 'selling')}
                        className={`w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm ${fieldHighlightClass(row.record.id, 'selling')}`}
                        value={row.values.selling}
                        disabled={!rowIsEditable(row) || !isFieldEditable(row.record, 'selling')}
                        onChange={event => handleTableValueChange(row.record.id, 'selling', event.target.value)}
                      />
                    </td>
                    <td className="px-3 py-3 text-center font-semibold text-emerald-700">
                      {profitValue !== null ? profitValue.toFixed(2) : '�'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="relative">
                        <span className={`inline-flex w-full items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${statusBadge}`}>
                          {row.values.status}
                        </span>
                        <select
                          ref={registerSheetField(row.record.id, 'status')}
                          className={`absolute inset-0 h-full w-full cursor-pointer opacity-0 ${!rowIsEditable(row) || !isFieldEditable(row.record, 'status') ? 'pointer-events-none' : ''} ${fieldHighlightClass(row.record.id, 'status')}`}
                          disabled={!rowIsEditable(row) || !isFieldEditable(row.record, 'status')}
                          value={row.values.status}
                          onChange={event =>
                            handleTableValueChange(row.record.id, 'status', event.target.value as InventoryRecordStatus)
                          }
                        >
                          {getStatusOptionsForRecord(row.record).map(status => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => openNoteModal(row.record)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
                      >
                        <InfoIcon className="h-4 w-4 text-slate-500" />
                        {row.record.notes && row.record.notes.trim().length ? 'View note' : 'Add note'}
                      </button>
                      <p className="mt-1 text-xs text-slate-500 break-words">
                        {row.record.notes && row.record.notes.trim().length ? row.record.notes : 'No notes yet'}
                      </p>
                    </td>
                    <td className="px-3 py-3 w-[200px] min-w-[180px] align-top">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-1">
                          {row.isDraft || row.isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveRow(row)}
                                disabled={row.saving || (!row.isDraft && !row.dirty)}
                                className={`${tableActionButtonClasses.success} ${
                                  row.saving || (!row.isDraft && !row.dirty) ? 'opacity-60' : ''
                                }`}
                              >
                                <Save className="h-3.5 w-3.5" />
                                {row.saving ? 'Saving...' : 'Save'}
                              </button>
                              {!row.isDraft && (
                                <button
                                  type="button"
                                  onClick={() => toggleRowEditing(row.record.id, false)}
                                  disabled={row.saving}
                                  className={`${tableActionButtonClasses.neutral} ${
                                    row.saving ? 'opacity-60' : ''
                                  }`}
                                >
                                  Cancel edit
                                </button>
                              )}
                              {row.isDraft && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDraftRow(row)}
                                  disabled={row.saving}
                                  className={`${tableActionButtonClasses.neutral} ${
                                    row.saving ? 'opacity-60' : ''
                                  }`}
                                >
                                  Remove
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleRowEditing(row.record.id, true)}
                              className={tableActionButtonClasses.neutral}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          )}
                        </div>
                        {!row.isDraft && (
                          <div className="flex flex-col gap-1">
                            {row.record.record_type === 'inventory' && row.record.status === 'Available' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setAssignmentModal({ mode: 'inventory', source: row.record, showAll: false })
                                }
                                className={tableActionButtonClasses.highlight}
                              >
                                <Link2 className="h-3.5 w-3.5" />
                                Assign order
                              </button>
                            )}
                            {row.record.record_type === 'order' && row.record.status === 'Unfulfilled' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setAssignmentModal({ mode: 'order', source: row.record, showAll: false })
                                }
                                className={tableActionButtonClasses.highlight}
                              >
                                <Link2 className="h-3.5 w-3.5" />
                                Assign inventory
                              </button>
                            )}
                            {row.record.record_type === 'sale' && row.record.status === 'Reserved' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setSaleAction({ sale: row.record, mode: 'complete' })}
                                  className={tableActionButtonClasses.success}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Complete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSaleAction({ sale: row.record, mode: 'unassign' })}
                                  className={tableActionButtonClasses.neutral}
                                >
                                  <Unlink className="h-3.5 w-3.5" />
                                  Unassign
                                </button>
                              </>
                            )}
                            {row.record.record_type === 'inventory' &&
                              row.record.quantity > 1 &&
                              row.record.status === 'Available' && (
                                <button
                                  type="button"
                                  onClick={() => openSplitModal(row.record)}
                                  className={tableActionButtonClasses.neutral}
                                >
                                  <LayoutGrid className="h-3.5 w-3.5" />
                                  Split
                                </button>
                              )}
                          {row.record.record_type !== 'sale' && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancelModal(row.record)
                                setCancelModalError(null)
                              }}
                              className={tableActionButtonClasses.danger}
                            >
                              Cancel
                            </button>
                          )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      {(tableMessage || tableError) && (
        <div className="border-t border-slate-200 px-4 py-3 text-sm">
          {tableMessage && <p className="text-emerald-600">{tableMessage}</p>}
          {tableError && <p className="text-rose-600">{tableError}</p>}
        </div>
      )}
    </div>
  )

  const renderCards = () => (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {visibleRecords.map(record => {
        const surface = statusSurfaceStyles[record.status] ?? statusSurfaceStyles.Available
        const seatAssignments = mapRecordAssignments(record)
        const noteEntry =
          cardNotes[record.id] ?? { value: record.notes ?? '', dirty: false, saving: false, error: null }
        return (
          <div
          key={record.id}
          role="button"
          tabIndex={0}
          onClick={event => {
            if ((event.target as HTMLElement)?.closest('button, a, input, select, textarea')) {
              return
            }
            if (record.record_type === 'sale') return
            openEditForm(record)
          }}
          onKeyDown={event => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            if ((event.target as HTMLElement)?.closest('button, a, input, select, textarea')) {
              return
            }
            if (record.record_type === 'sale') {
              return
            }
            event.preventDefault()
            openEditForm(record)
          }}
          className={`rounded-3xl border p-4 shadow-sm cursor-pointer transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] ${surface.cardBg}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{record.record_type}</p>
              <p className="text-xl font-semibold text-slate-900">
                {record.area ?? 'Unassigned'} - Qty {record.quantity}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClasses[record.status] ?? statusBadgeClasses.Available}`}>
              {record.status}
            </span>
          </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600">
              <Info label="Block" value={record.block} />
              <Info label="Row" value={record.row} />
              <Info label="Seats" value={formatSeatSummary(seatAssignments)} />
              {record.record_type !== 'order' && (
                <Info label="Members" value={summarizeMemberNames(seatAssignments, memberOptions)} />
              )}
            {record.record_type === 'inventory' && (
              <>
                <Info label="Bought from" value={record.bought_from} />
                <Info
                  label="Cost"
                  value={record.cost ? formatCurrency(record.cost, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                />
              </>
            )}
            {record.record_type !== 'inventory' && (
              <>
                <Info label="Order #" value={record.order_number} />
                <Info label="Sold to" value={record.sold_to} />
                <Info
                  label="Selling"
                  value={record.selling ? formatCurrency(record.selling, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                />
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(record.record_type === 'inventory' || record.record_type === 'order') && (
              <button
                type="button"
                onClick={() => openEditForm(record)}
                className={cardActionButtonClasses.neutral}
              >
                <Pencil className="h-4 w-4" />
                Edit
              </button>
            )}
            {record.record_type === 'inventory' && record.status === 'Available' && (
              <button
                type="button"
                onClick={() => setAssignmentModal({ mode: 'inventory', source: record, showAll: false })}
                className={cardActionButtonClasses.highlight}
              >
                <Link2 className="h-4 w-4" />
                Assign order
              </button>
            )}
            {record.record_type === 'order' && record.status === 'Unfulfilled' && (
              <button
                type="button"
                onClick={() => setAssignmentModal({ mode: 'order', source: record, showAll: false })}
                className={cardActionButtonClasses.highlight}
              >
                <Link2 className="h-4 w-4" />
                Assign inventory
              </button>
            )}
            {record.record_type === 'sale' && record.status === 'Reserved' && (
              <>
                <button
                  type="button"
                  onClick={() => setSaleAction({ sale: record, mode: 'complete' })}
                  className={cardActionButtonClasses.success}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Complete sale
                </button>
                <button
                  type="button"
                  onClick={() => setSaleAction({ sale: record, mode: 'unassign' })}
                  className={cardActionButtonClasses.neutral}
                >
                  <Unlink className="h-4 w-4" />
                  Unassign
                </button>
              </>
            )}
            {record.record_type === 'inventory' && record.quantity > 1 && record.status === 'Available' && (
              <button
                type="button"
                onClick={() => openSplitModal(record)}
                className={cardActionButtonClasses.neutral}
              >
                <LayoutGrid className="h-4 w-4" />
                Split purchase
              </button>
            )}
            {record.record_type !== 'sale' && (
              <button
                type="button"
                onClick={() => {
                  setCancelModal(record)
                  setCancelModalError(null)
                }}
                className={`${cardActionButtonClasses.neutral} border-rose-200 text-rose-600 hover:border-rose-300`}
              >
                Cancel
              </button>
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Notes</p>
            <textarea
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
              rows={3}
              value={noteEntry.value}
              onChange={event => updateCardNoteDraft(record.id, event.target.value)}
              placeholder="Type a note for this record"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!noteEntry.dirty || noteEntry.saving}
                onClick={() => handleCardNoteSave(record.id)}
                className="inline-flex items-center gap-2 rounded-full bg-[#1d4ed8] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
              >
                {noteEntry.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
              {noteEntry.error && <span className="text-xs text-rose-600">{noteEntry.error}</span>}
              {!noteEntry.error && noteEntry.dirty && !noteEntry.saving && (
                <span className="text-xs text-slate-500">Unsaved changes</span>
              )}
              {!noteEntry.error && !noteEntry.dirty && !noteEntry.saving && record.notes && (
                <span className="text-xs text-slate-400">Up to date</span>
              )}
            </div>
          </div>
        </div>
      )})}
    </div>
  )

  const heroMetrics = [
    { label: 'Total quantity', value: heroTotals.quantity.toLocaleString(), helper: 'Tickets logged' },
    { label: 'Total cost', value: formatCurrency(heroTotals.cost, { maximumFractionDigits: 0 }), helper: 'Purchase price' },
    { label: 'Target selling', value: formatCurrency(heroTotals.selling, { maximumFractionDigits: 0 }), helper: 'Asking price' },
    { label: 'Projected profit', value: formatCurrency(heroTotals.profit, { maximumFractionDigits: 0 }), helper: 'Based on target sell' }
  ]

  const renderFixtureSummary = () => {
    if (!resolvedFixture) {
      return (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
          Choose a fixture to see the matchup overview.
        </div>
      )
    }

    const kickoff = resolvedFixture.date ? new Date(resolvedFixture.date) : null
    const dateLabel = kickoff
      ? kickoff.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Date to be confirmed'
    const timeLabel = kickoff
      ? kickoff.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : null

    const renderClub = (name: string | null, logo: string | null, role: 'Home' | 'Away') => (
      <div className={`flex items-center gap-3 ${role === 'Away' ? 'flex-row-reverse text-right' : ''}`}>
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow">
          {logo ? (
            <img
              src={logo}
              alt={`${name ?? role} logo`}
              className="h-10 w-10 rounded-full object-contain p-1"
              onError={event => {
                event.currentTarget.style.visibility = 'hidden'
              }}
            />
          ) : (
            <span className="text-sm font-semibold uppercase text-slate-500">
              {(name ?? role).slice(0, 3)}
            </span>
          )}
        </div>
        <div>
          <p className={`text-xl font-semibold text-slate-900 ${role === 'Away' ? 'text-right' : ''}`}>{name ?? role}</p>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{role}</p>
        </div>
      </div>
    )

    return (
      <div className="rounded-[32px] border border-white/70 bg-gradient-to-r from-white via-slate-50 to-white px-6 py-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          {renderClub(resolvedFixture.home_team, resolvedFixture.home_logo ?? null, 'Home')}
          <div className="flex items-center justify-center">
            <div className="flex flex-col items-center justify-center rounded-full bg-[#eef2ff] px-6 py-4 text-center text-slate-700 shadow-inner">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8aa0ff]">VS</p>
              <p className="text-sm font-semibold text-slate-900">{dateLabel}</p>
              {timeLabel && <p className="text-xs text-slate-500">{timeLabel}</p>}
            </div>
          </div>
          {renderClub(resolvedFixture.away_team, resolvedFixture.away_logo ?? null, 'Away')}
        </div>
      </div>
    )
  }

  const selectedFixturePinned = resolvedFixture ? isPinned(resolvedFixture.id) : false

  const headerContent = (
    <div>
      <h1 className="text-3xl font-bold text-slate-900">Inventory & Orders</h1>
      <p className="mt-2 text-sm text-slate-500">
        Manage purchases, orders, and sales assignments for every fixture.
      </p>
    </div>
  )
  return (
    <DashboardLayout
      header={headerContent}
      headerActions={
        <div className="flex flex-wrap items-center gap-3">
          <BulkActionsButton
            triggerLabel="Export inventory"
            title="Export inventory"
            description="Send the latest purchases, orders, and seat assignments to finance or BI tools with a single CSV."
            note="Export only - inventory can be edited from the grid below."
            columns={INVENTORY_EXPORT_COLUMNS}
            downloadData={handleInventoryDownload}
            downloadTemplate={handleInventoryTemplateDownload}
            dataFallbackName="inventory.csv"
            templateFallbackName="inventory-template.csv"
            className="inline-flex"
          />
          <button
            type="button"
            onClick={loadRecords}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      }
    >
      <div className="space-y-8">
        <section className="rounded-[30px] border border-white/70 bg-white px-6 py-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] space-y-5">
          {pinnedEvents.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8aa0ff]">Pinned fixtures</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {pinnedEvents.slice(0, 6).map(event => (
                  <button
                    key={event.fixture_id}
                    type="button"
                    onClick={() =>
                      setSelectedFixture({
                        id: event.fixture_id,
                        home_team: event.home_team ?? 'Home',
                        away_team: event.away_team ?? 'Away',
                        date: event.event_date,
                        home_logo: event.home_team_logo ?? event.home_logo ?? null,
                        away_logo: event.away_team_logo ?? event.away_logo ?? null
                      })
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-[#cbd6ff] bg-white px-4 py-2 text-xs font-semibold text-[#1d4ed8] shadow-sm transition hover:border-[#1d4ed8]"
                  >
                    {event.home_team ?? 'Home'} vs {event.away_team ?? 'Away'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <FixtureSearch
            onSelect={fixture => setSelectedFixture(fixture)}
            label="Find fixtures"
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Selected fixture</p>
              {resolvedFixture && (
                <button
                  type="button"
                  onClick={handleToggleFixturePin}
                  disabled={pinningFixture}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold ${
                    selectedFixturePinned ? 'border-rose-200 text-rose-600 hover:border-rose-300' : 'border-slate-200 text-slate-700'
                  } ${pinningFixture ? 'opacity-60 cursor-not-allowed' : 'hover:border-slate-400'}`}
                >
                  {selectedFixturePinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  {selectedFixturePinned ? 'Unpin fixture' : 'Pin fixture'}
                </button>
              )}
            </div>
            {renderFixtureSummary()}
          </div>
        </section>

        {resolvedFixture && (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {heroMetrics.map(metric => (
              <MetricTile key={metric.label} label={metric.label} value={metric.value} helper={metric.helper} />
            ))}
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('sheet')}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold ${viewMode === 'sheet' ? 'bg-[#1d4ed8] text-white shadow' : 'border border-slate-200 text-slate-600'}`}
            >
              <Table className="h-4 w-4" />
              Sheet
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold ${viewMode === 'cards' ? 'bg-[#1d4ed8] text-white shadow' : 'border border-slate-200 text-slate-600'}`}
            >
              <LayoutGrid className="h-4 w-4" />
              Cards
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openForm('purchase')}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-4 py-2 text-xs font-semibold text-white shadow"
            >
              <Plus className="h-4 w-4" />
              New purchase
            </button>
            <button
              type="button"
              onClick={() => openForm('order')}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
            >
              <Plus className="h-4 w-4" />
              New order
            </button>
          </div>
        </div>

        <div>
          {loadingRecords ? (
            <div className="mt-6 flex items-center justify-center rounded-3xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading inventory...
            </div>
          ) : recordsError ? (
            <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
              {recordsError}
            </div>
          ) : viewMode === 'sheet' ? (
            visibleTableRows.length ? (
              renderTable()
            ) : (
              <div className="mt-6 rounded-3xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-500">
                {resolvedFixture ? 'No records logged for this fixture yet.' : 'Select a fixture to begin.'}
              </div>
            )
          ) : visibleRecords.length ? (
            renderCards()
          ) : (
            <div className="mt-6 rounded-3xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-500">
              {resolvedFixture ? 'No records logged for this fixture yet.' : 'Select a fixture to begin.'}
            </div>
          )}
        </div>
      </div>
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  Cancel {cancelModal.record_type === 'inventory' ? 'purchase' : 'order'}
                </p>
                <p className="text-sm text-slate-500">
                  This will also cancel its linked transaction. Are you sure you want to continue?
                </p>
              </div>
              <button type="button" onClick={() => setCancelModal(null)} className="text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            {cancelModalError && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {cancelModalError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelModal(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Keep record
              </button>
              <button
                type="button"
                onClick={() => handleDeleteRecord(cancelModal)}
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white"
              >
                <Trash2 className="h-4 w-4" />
                Cancel record
              </button>
            </div>
          </div>
        </div>
      )}
      {seatEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-slate-900">Manage seats & members</p>
                <p className="text-sm text-slate-500">Quantity: {seatEditor.quantity}</p>
              </div>
              <button type="button" onClick={handleSeatEditorCancel} className="text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Seats follow the quantity in the table. Update the quantity first if you need more or fewer slots.
            </p>
            <SeatAssignmentsList
              assignments={seatEditor.assignments}
              memberOptions={memberOptions}
              onChange={handleSeatEditorChange}
            />
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleSeatEditorCancel}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSeatEditorSave}
                className="inline-flex items-center gap-2 rounded-full bg-[#1d4ed8] px-4 py-2 text-xs font-semibold text-white"
              >
                <Save className="h-4 w-4" />
                Save seats
              </button>
            </div>
          </div>
        </div>
      )}
      {splitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-slate-900">Split purchase</p>
                <p className="text-sm text-slate-500">
                  {splitModal.record.area ?? 'Unassigned'} � Qty {splitModal.record.quantity}
                </p>
              </div>
              <button type="button" onClick={() => setSplitModal(null)} className="text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <span>
                Planned quantity:{' '}
                <span className="font-semibold">
                  {splitModal.parts.reduce((sum, part) => sum + (Number(part.quantity) || 0), 0)}
                </span>{' '}
                / {splitModal.record.quantity}
              </span>
              <button
                type="button"
                onClick={() =>
                  setSplitModal(prev =>
                    prev
                      ? {
                          ...prev,
                          parts: [...prev.parts, { id: generatePartId(), quantity: '1', assignments: ensureSeatAssignmentLength([], 1) }]
                        }
                      : prev
                  )
                }
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add part
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {splitModal.parts.map((part, index) => {
                const seatOffset = splitModal.parts
                  .slice(0, index)
                  .reduce((sum, current) => sum + current.assignments.length, 0)
                const quantityField = (
                  <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Quantity
                    <input
                      type="number"
                      min="1"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={part.quantity}
                      onChange={event =>
                        setSplitModal(prev =>
                          prev
                            ? {
                                ...prev,
                                parts: prev.parts.map(item =>
                                  item.id === part.id
                                    ? {
                                        ...item,
                                        quantity: event.target.value,
                                        assignments: ensureSeatAssignmentLength(
                                          item.assignments,
                                          Number(event.target.value) > 0 ? Number(event.target.value) : 0
                                        )
                                      }
                                    : item
                                )
                              }
                            : prev
                        )
                      }
                    />
                  </label>
                )
                return (
                  <div key={part.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">Part {index + 1}</p>
                      {splitModal.parts.length > 2 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSplitModal(prev =>
                              prev ? { ...prev, parts: prev.parts.filter(item => item.id !== part.id) } : prev
                            )
                          }
                          className="text-xs font-semibold text-rose-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="mt-3">
                      <div className="grid gap-3 sm:grid-cols-3 sm:items-start">
                        {part.assignments.map((assignment, assignmentIndex) => (
                          <Fragment key={`${part.id}-${assignmentIndex}`}>
                            {assignmentIndex === 0 ? (
                              quantityField
                            ) : (
                              <div className="hidden sm:block" aria-hidden="true" />
                            )}
                            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                              Seat {seatOffset + assignmentIndex + 1}
                              <input
                                type="text"
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                value={assignment.seat}
                                onChange={event =>
                                  setSplitModal(prev =>
                                    prev
                                      ? {
                                          ...prev,
                                          parts: prev.parts.map(item => {
                                            if (item.id !== part.id || !item.assignments[assignmentIndex]) return item
                                            const nextAssignments = cloneSeatAssignments(item.assignments)
                                            nextAssignments[assignmentIndex] = {
                                              ...nextAssignments[assignmentIndex],
                                              seat: event.target.value
                                            }
                                            return { ...item, assignments: nextAssignments }
                                          })
                                        }
                                      : prev
                                  )
                                }
                              />
                            </label>
                            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                              Member {seatOffset + assignmentIndex + 1}
                              <select
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                value={assignment.memberId}
                                onChange={event =>
                                  setSplitModal(prev =>
                                    prev
                                      ? {
                                          ...prev,
                                          parts: prev.parts.map(item => {
                                            if (item.id !== part.id || !item.assignments[assignmentIndex]) return item
                                            const nextAssignments = cloneSeatAssignments(item.assignments)
                                            nextAssignments[assignmentIndex] = {
                                              ...nextAssignments[assignmentIndex],
                                              memberId: event.target.value
                                            }
                                            return { ...item, assignments: nextAssignments }
                                          })
                                        }
                                      : prev
                                  )
                                }
                              >
                                <option value="">No member</option>
                                {memberOptions.map(option => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {splitModal.error && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {splitModal.error}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSplitModal(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                disabled={splitModal.saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!token) return
                  const totalPlanned = splitModal.parts.reduce((sum, part) => sum + (Number(part.quantity) || 0), 0)
                  if (totalPlanned !== splitModal.record.quantity) {
                    setSplitModal(prev =>
                      prev
                        ? { ...prev, error: `Split quantities must add up to ${splitModal.record.quantity}.` }
                        : prev
                    )
                    return
                  }
                  const invalidPart = splitModal.parts.find(
                    part => !Number.isFinite(Number(part.quantity)) || Number(part.quantity) <= 0
                  )
                  if (invalidPart) {
                    setSplitModal(prev =>
                      prev ? { ...prev, error: 'Each part must have a positive quantity.' } : prev
                    )
                    return
                  }
                  setSplitModal(prev => (prev ? { ...prev, saving: true, error: null } : prev))
                  const partsPayload = splitModal.parts.map(part => {
                    const qty = Number(part.quantity)
                    const assignments = ensureSeatAssignmentLength(part.assignments, qty)
                    return {
                      quantity: qty,
                      seats: seatAssignmentsToString(assignments),
                      seat_assignments: toSeatAssignmentPayload(assignments),
                      member_id: resolvePrimaryMemberFromAssignments(assignments)
                    }
                  })
                  const result = await splitInventoryRecordApi(token, splitModal.record.id, partsPayload)
                  if (!result.ok) {
                    setSplitModal(prev => (prev ? { ...prev, saving: false, error: result.error } : prev))
                    return
                  }
                  await loadRecords()
                  setSplitModal(null)
                }}
                disabled={splitModal.saving}
                className="inline-flex items-center gap-2 rounded-full bg-[#1d4ed8] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {splitModal.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Split tickets
              </button>
            </div>
          </div>
        </div>
      )}
      {assignmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {assignmentModal.mode === 'inventory' ? 'Assign order' : 'Assign inventory'}
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  {assignmentModal.source.area ?? 'Unassigned'} - Qty {assignmentModal.source.quantity}
                </p>
              </div>
              <button type="button" onClick={() => setAssignmentModal(null)} className="text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Suggested matches {assignmentModal.showAll ? '(showing all)' : '(matching area & seats)'}
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-[#1d4ed8]"
                onClick={() => setAssignmentModal(state => (state ? { ...state, showAll: !state.showAll } : state))}
              >
                {assignmentModal.showAll ? 'Show suggested' : 'Show all'}
              </button>
            </div>
            <div className="mt-4 max-h-[320px] space-y-3 overflow-y-auto">
              {filteredSuggestions(assignmentModal.source, assignmentModal.showAll).map(target => (
                <div key={target.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {target.area ?? 'Unassigned'} - Qty {target.quantity}
                    </p>
                    <p className="text-xs text-slate-500">
                      {target.record_type === 'order' ? target.sold_to ?? 'No buyer' : target.bought_from ?? 'No source'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full bg-[#1d4ed8] px-4 py-2 text-xs font-semibold text-white"
                    onClick={() =>
                      assignmentModal.mode === 'inventory'
                        ? handleAssignment(assignmentModal.source.id, target.id)
                        : handleAssignment(target.id, assignmentModal.source.id)
                    }
                  >
                    <Link2 className="h-4 w-4" />
                    Assign
                  </button>
                </div>
              ))}
              {!filteredSuggestions(assignmentModal.source, assignmentModal.showAll).length && (
                <p className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  No matches available.
                </p>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs">
              <button
                type="button"
                className="text-[#1d4ed8]"
                onClick={() => {
                  if (assignmentModal.mode === 'inventory') {
                    setAutoAssignContext({ inventoryId: assignmentModal.source.id })
                    openForm('order', {
                      quantity: assignmentModal.source.quantity.toString(),
                      area: assignmentModal.source.area ?? '',
                      block: assignmentModal.source.block ?? '',
                      row: assignmentModal.source.row ?? ''
                    })
                  } else {
                    setAutoAssignContext({ orderId: assignmentModal.source.id })
                    openForm('purchase', {
                      quantity: assignmentModal.source.quantity.toString(),
                      area: assignmentModal.source.area ?? '',
                      block: assignmentModal.source.block ?? '',
                      row: assignmentModal.source.row ?? ''
                    })
                  }
                  setAssignmentModal(null)
                }}
              >
                {assignmentModal.mode === 'inventory' ? 'Add new order (auto-assign)' : 'Add new purchase (auto-assign)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {saleAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              {saleAction.mode === 'complete' ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              ) : (
                <AlertCircle className="h-8 w-8 text-amber-500" />
              )}
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {saleAction.mode === 'complete' ? 'Complete sale' : 'Unassign sale'}
                </p>
                <p className="text-sm text-slate-500">
                  {saleAction.mode === 'complete'
                    ? 'Mark this sale as completed? This will close the inventory and order.'
                    : 'Unassign this sale? Inventory and order will be restored.'}
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSaleAction(null)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaleAction(saleAction)}
                className="inline-flex items-center gap-2 rounded-full bg-[#1d4ed8] px-4 py-2 text-xs font-semibold text-white"
              >
                {saleAction.mode === 'complete' ? <CheckCircle2 className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Notes</p>
                <p className="text-lg font-semibold text-slate-900">
                  {noteModal.record.area ?? 'Unassigned'} · Qty {noteModal.record.quantity}
                </p>
              </div>
              <button type="button" onClick={() => setNoteModal(null)} className="text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <textarea
              className="mt-4 h-32 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
              value={noteModal.value}
              onChange={event => handleNoteModalChange(event.target.value)}
              placeholder="Add context, reminders, or follow-ups for this record."
            />
            {noteModal.error && (
              <p className="mt-2 text-sm text-rose-600">{noteModal.error}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setNoteModal(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={noteModal.saving}
                onClick={handleNoteModalSave}
                className="inline-flex items-center gap-2 rounded-full bg-[#1d4ed8] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {noteModal.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save note
              </button>
            </div>
          </div>
        </div>
      )}

      {formMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {formIntent === 'edit'
                    ? formMode === 'purchase'
                      ? 'Edit purchase'
                      : 'Edit order'
                    : formMode === 'purchase'
                      ? 'New purchase'
                      : 'New order'}
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  {resolvedFixture
                    ? `${resolvedFixture.home_team} vs ${resolvedFixture.away_team}`
                    : 'Select a fixture to continue'}
                </p>
              </div>
              <button type="button" onClick={closeFormModal} className="text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {(formMode === 'purchase' ? Object.entries(purchaseValues) : Object.entries(orderValues))
                .filter(
                  ([field]) =>
                    (formIntent === 'edit' || field !== 'status') &&
                    field !== 'bought_from_vendor_id' &&
                    field !== 'sold_to_vendor_id'
                )
                .map(([field, value]) => {
                const isStatusField = field === 'status'
                const isMemberField = field === 'member_id'
                const isVendorField = field === 'bought_from' || field === 'sold_to'
                const label = field === 'member_id'
                  ? 'member'
                  : field === 'bought_from'
                    ? 'bought from'
                    : field === 'sold_to'
                      ? 'sold to'
                      : field.replace(/_/g, ' ')
                const statusOptions = isStatusField
                  ? getStatusOptionsForForm(formMode, value as InventoryRecordStatus)
                  : []
                return (
                  <label key={field} className="text-xs font-semibold text-slate-600">
                    {label}
                    {isStatusField ? (
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={value as InventoryRecordStatus}
                        onChange={event =>
                          handleFormChange(
                            formMode,
                            field as keyof PurchaseFormValues | keyof OrderFormValues,
                            event.target.value
                          )
                        }
                      >
                        {statusOptions.map(status => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    ) : isMemberField ? (
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={value}
                        onChange={event =>
                          handleFormChange(
                            formMode,
                            field as keyof PurchaseFormValues | keyof OrderFormValues,
                            event.target.value
                          )
                        }
                      >
                        <option value="">No member</option>
                        {memberOptions.map(option => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : isVendorField ? (
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={
                          field === 'bought_from'
                            ? purchaseValues.bought_from_vendor_id
                            : orderValues.sold_to_vendor_id
                        }
                        onChange={event => handleFormVendorSelection(formMode, event.target.value)}
                      >
                        <option value="">
                          {field === 'bought_from'
                            ? purchaseValues.bought_from_vendor_id
                              ? 'Select CounterParty'
                              : purchaseValues.bought_from || 'Select CounterParty'
                            : orderValues.sold_to_vendor_id
                              ? 'Select CounterParty'
                              : orderValues.sold_to || 'Select CounterParty'}
                        </option>
                        {vendorOptionsWithFallback(
                          field === 'bought_from'
                            ? purchaseValues.bought_from_vendor_id
                            : orderValues.sold_to_vendor_id,
                          value as string
                        ).map(option => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={['quantity', 'cost', 'selling'].includes(field) ? 'number' : 'text'}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={value}
                        onChange={event =>
                          handleFormChange(
                            formMode,
                            field as keyof PurchaseFormValues | keyof OrderFormValues,
                            event.target.value
                          )
                        }
                        list={
                          field === 'area'
                            ? 'inventory-area-options'
                            : field === 'bought_from'
                              ? 'inventory-vendor-bought-options'
                              : field === 'sold_to'
                                ? 'inventory-vendor-sold-options'
                                : undefined
                        }
                      />
                    )}
                  </label>
                )
              })}
            </div>
            {formMode === 'purchase' && (
              <div className="mt-4 rounded-2xl border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Seats & Members</p>
                {purchaseSeatAssignments.length ? (
                  <SeatAssignmentsList
                    assignments={purchaseSeatAssignments}
                    memberOptions={memberOptions}
                    onChange={handlePurchaseAssignmentChange}
                  />
                ) : (
                  <p className="mt-2 text-sm text-slate-500">Enter a quantity to configure seat assignments.</p>
                )}
              </div>
            )}
            {formError && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {formError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  closeFormModal()
                  setAutoAssignContext(null)
                }}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={formSaving}
                onClick={handleSubmitForm}
                className="inline-flex items-center gap-2 rounded-full bg-[#1d4ed8] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {formSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {formIntent === 'edit' ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      <datalist id="inventory-area-options">
        {areaOptions.map(option => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </DashboardLayout>
  )
}



const SeatAssignmentsList = ({
  assignments,
  memberOptions,
  onChange,
  startIndex = 0,
  className = ''
}: {
  assignments: SeatAssignmentFormValue[]
  memberOptions: Array<{ id: string; label: string }>
  onChange?: (index: number, field: 'seat' | 'memberId', value: string) => void
  startIndex?: number
  className?: string
}) => (
  <div className={`mt-4 space-y-3 ${className}`}>
    {assignments.length === 0 ? (
      <p className="text-sm text-slate-500">No seat slots configured.</p>
    ) : (
      assignments.map((assignment, index) => (
        <div key={`seat-${index}`} className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Seat {startIndex + index + 1}
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={assignment.seat}
              onChange={event => onChange?.(index, 'seat', event.target.value)}
              disabled={!onChange}
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Member {startIndex + index + 1}
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={assignment.memberId}
              onChange={event => onChange?.(index, 'memberId', event.target.value)}
              disabled={!onChange}
            >
              <option value="">No member</option>
              {memberOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))
    )}
  </div>
)

const MetricTile = ({ label, value, helper }: { label: string; value: string; helper: string }) => (
  <div className="rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-sm">
    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{helper}</p>
  </div>
)

const Info = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
    <p className="text-sm font-semibold text-slate-900">{value ?? '--'}</p>
  </div>
)

export default InventoryPage
