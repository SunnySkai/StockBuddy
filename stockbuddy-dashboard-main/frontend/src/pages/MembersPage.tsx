import type { FormEvent } from 'react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  LayoutGrid,
  Loader2,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Table,
  Trash2,
  UsersRound,
  X
} from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import BulkActionsButton from '../components/BulkActionsButton'
import LoadingScreen from '../components/LoadingScreen'
import { useSession } from '../context/SessionContext'
import { useCurrency } from '../context/CurrencyContext'
import {
  createMember,
  deleteMember,
  downloadMembersCsv,
  fetchMembers,
  updateMember,
  uploadMembersSpreadsheet
} from '../api/members'
import { searchTeams } from '../api/football'
import type { ApiResult, DownloadPayload } from '../api/client'
import type { MemberCreatePayload, MemberRecord, MemberStatus, MemberUpdatePayload } from '../types/members'
import type { BulkImportResponse } from '../types/imports'
import { MEMBER_BULK_COLUMNS } from '../constants/bulkColumns'

type FormState = {
  name: string
  email: string
  group_label: string
  team_id: string
  team_name: string
  team_logo: string
  account_password: string
  account_number: string
  date_of_birth: string
  membership_type: string
  member_age_type: string
  phone_number: string
  address: string
  post_code: string
  membership_price: string
  status: MemberStatus
}

type TeamSelection = {
  id: string
  name: string
  logo: string | null
}

type MemberRow = {
  id: string
  record: MemberRecord
  values: FormState
  dirty: boolean
  saving: boolean
  deleting: boolean
  error: string | null
  isNew: boolean
}

const createEmptyStats = (): MemberStats => ({
  active: 0,
  banned: 0,
  totalMembers: 0,
  totalCost: 0
})

const parseMembershipPrice = (value: string | null | undefined): number => {
  if (!value) return 0
  const numeric = Number(value.replace(/[^0-9.-]+/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

const aggregateStatsForRows = (rows: MemberRow[], options?: { teamId?: string | null }): MemberStats => {
  const stats = createEmptyStats()
  rows.forEach(row => {
    if (row.isNew) {
      return
    }
    const rowTeamId = (row.record.team_id || row.values.team_id || '').trim()
    if (options?.teamId && rowTeamId !== options.teamId) {
      return
    }
    stats.totalMembers += 1
    if (row.record.status === 'BANNED') {
      stats.banned += 1
    } else {
      stats.active += 1
    }
    stats.totalCost += parseMembershipPrice(row.record.membership_price ?? row.values.membership_price ?? '')
  })
  return stats
}

const buildTeamStatsMap = (rows: MemberRow[]): Map<string, MemberStats> => {
  const map = new Map<string, MemberStats>()
  rows.forEach(row => {
    if (row.isNew) {
      return
    }
    const teamId = (row.record.team_id || row.values.team_id || '').trim()
    const teamName = (row.record.team_name || row.values.team_name || '').trim()
    if (!teamId || !teamName) {
      return
    }
    const stats = map.get(teamId) ?? createEmptyStats()
    stats.totalMembers += 1
    if (row.record.status === 'BANNED') {
      stats.banned += 1
    } else {
      stats.active += 1
    }
    stats.totalCost += parseMembershipPrice(row.record.membership_price ?? row.values.membership_price ?? '')
    map.set(teamId, stats)
  })
  return map
}

type ViewState =
  | { status: 'idle' }
  | { status: 'loading'; message?: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

type SheetField = {
  key: keyof FormState
  label: string
  placeholder?: string
  type?: 'text' | 'select'
  options?: Array<{ label: string; value: string }>
}

type GroupColorTheme = {
  accent: string
  accentMuted: string
  headerBackground: string
  headerText: string
  headerBorder: string
  headerChipBackground: string
  headerChipText: string
  rowGradientFrom: string
  rowGradientTo: string
  rowBorder: string
  chipBackground: string
  chipText: string
  chipBorder: string
  cardBorder: string
  cardShadow: string
  cardGradientFrom: string
  cardGradientTo: string
}

type MemberStats = {
  active: number
  banned: number
  totalMembers: number
  totalCost: number
}

const emptyFormState: FormState = {
  name: '',
  email: '',
  group_label: '',
  team_id: '',
  team_name: '',
  team_logo: '',
  account_password: '',
  account_number: '',
  date_of_birth: '',
  membership_type: '',
  member_age_type: '',
  phone_number: '',
  address: '',
  post_code: '',
  membership_price: '',
  status: 'ACTIVE'
}

const memberStatusOptions: Array<{ label: string; value: MemberStatus }> = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Banned', value: 'BANNED' }
]

const statusSelectTone: Record<MemberStatus, string> = {
  ACTIVE: 'border border-emerald-300 text-emerald-700 focus:border-emerald-400 focus:ring-emerald-100 bg-white',
  BANNED: 'border border-rose-300 text-rose-700 focus:border-rose-400 focus:ring-rose-100 bg-white'
}

const statusChipTone: Record<MemberStatus, string> = {
  ACTIVE: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  BANNED: 'border border-rose-200 bg-rose-50 text-rose-600'
}

const formatStatusLabel = (status: MemberStatus): string => (status === 'ACTIVE' ? 'Active' : 'Banned')

const getStatusSelectClasses = (status: MemberStatus): string => {
  const tone = statusSelectTone[status] ?? 'border border-slate-200 bg-white text-slate-700 focus:border-[#2563eb] focus:ring-[#2563eb]/20'
  return `w-full rounded-xl px-3 py-2 text-[13px] font-semibold uppercase tracking-wide outline-none transition focus:ring-4 ${tone}`
}

const getStatusChipClasses = (status: MemberStatus): string => {
  const tone = statusChipTone[status] ?? 'border border-slate-200 bg-white text-slate-600'
  return `inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${tone}`
}

const sheetFields: SheetField[] = [
  { key: 'name', label: 'Full name', placeholder: 'Jordan Parker' },
  { key: 'email', label: 'Email', placeholder: 'jordan@club.com' },
  { key: 'account_number', label: 'Account number', placeholder: 'AC-93844' },
  { key: 'account_password', label: 'Account password', placeholder: '********' },
  { key: 'group_label', label: 'Group', placeholder: 'Suite A-1' },
  { key: 'date_of_birth', label: 'DOB', placeholder: '1990-08-12' },
  { key: 'membership_type', label: 'Member type', placeholder: 'VIP' },
  { key: 'address', label: 'Address', placeholder: '221B Baker Street, London' },
  { key: 'post_code', label: 'Post code', placeholder: 'NW16XE' },
  { key: 'phone_number', label: 'Phone number', placeholder: '+44 20 7946 0958' },
  { key: 'membership_price', label: 'Membership price', placeholder: '399' },
  { key: 'member_age_type', label: 'Member age type', placeholder: 'Adult' },
  { key: 'status', label: 'Status', type: 'select', options: memberStatusOptions }
]

const groupColorThemes: Record<'single' | 'pair' | 'trio' | 'quad' | 'many', GroupColorTheme> = {
  quad: {
    accent: '#7c3aed',
    accentMuted: '#c4b5fd',
    headerBackground: 'rgba(243, 240, 255, 0.98)',
    headerText: '#4c1d95',
    headerBorder: 'rgba(199, 181, 255, 0.8)',
    headerChipBackground: 'rgba(235, 229, 255, 0.95)',
    headerChipText: '#5b21b6',
    rowGradientFrom: 'rgba(248, 245, 255, 0.9)',
    rowGradientTo: 'rgba(236, 230, 253, 0.7)',
    rowBorder: 'rgba(212, 196, 255, 0.8)',
    chipBackground: 'rgba(237, 233, 254, 0.95)',
    chipText: '#6d28d9',
    chipBorder: 'rgba(196, 181, 253, 1)',
    cardBorder: '#c4b5fd',
    cardShadow: '0 25px 60px rgba(109, 40, 217, 0.18)',
    cardGradientFrom: '#ffffff',
    cardGradientTo: '#f5ecff'
  },
  trio: {
    accent: '#0f9d58',
    accentMuted: '#9ae6b4',
    headerBackground: 'rgba(231, 248, 238, 0.96)',
    headerText: '#065f46',
    headerBorder: 'rgba(152, 230, 188, 0.8)',
    headerChipBackground: 'rgba(222, 247, 236, 0.95)',
    headerChipText: '#047857',
    rowGradientFrom: 'rgba(240, 253, 244, 0.9)',
    rowGradientTo: 'rgba(222, 247, 236, 0.7)',
    rowBorder: 'rgba(134, 239, 172, 0.8)',
    chipBackground: 'rgba(209, 250, 229, 0.95)',
    chipText: '#047857',
    chipBorder: 'rgba(134, 239, 172, 1)',
    cardBorder: '#6ee7b7',
    cardShadow: '0 25px 60px rgba(16, 185, 129, 0.2)',
    cardGradientFrom: '#ffffff',
    cardGradientTo: '#ecfdf5'
  },
  single: {
    accent: '#f97316',
    accentMuted: '#fed7aa',
    headerBackground: 'rgba(255, 248, 237, 0.97)',
    headerText: '#9a3412',
    headerBorder: 'rgba(253, 213, 156, 0.8)',
    headerChipBackground: 'rgba(255, 243, 222, 0.95)',
    headerChipText: '#b45309',
    rowGradientFrom: 'rgba(255, 247, 237, 0.9)',
    rowGradientTo: 'rgba(255, 239, 213, 0.7)',
    rowBorder: 'rgba(251, 211, 141, 0.8)',
    chipBackground: 'rgba(255, 251, 235, 0.95)',
    chipText: '#b45309',
    chipBorder: 'rgba(252, 211, 77, 1)',
    cardBorder: '#fbbf24',
    cardShadow: '0 25px 60px rgba(251, 191, 36, 0.23)',
    cardGradientFrom: '#ffffff',
    cardGradientTo: '#fff7ed'
  },
  pair: {
    accent: '#2563eb',
    accentMuted: '#bfdbfe',
    headerBackground: 'rgba(234, 245, 255, 0.97)',
    headerText: '#1e3a8a',
    headerBorder: 'rgba(191, 219, 254, 0.8)',
    headerChipBackground: 'rgba(223, 237, 255, 0.95)',
    headerChipText: '#1d4ed8',
    rowGradientFrom: 'rgba(239, 246, 255, 0.9)',
    rowGradientTo: 'rgba(221, 232, 255, 0.7)',
    rowBorder: 'rgba(147, 197, 253, 0.8)',
    chipBackground: 'rgba(219, 234, 254, 0.95)',
    chipText: '#1d4ed8',
    chipBorder: 'rgba(147, 197, 253, 1)',
    cardBorder: '#93c5fd',
    cardShadow: '0 25px 60px rgba(59, 130, 246, 0.18)',
    cardGradientFrom: '#ffffff',
    cardGradientTo: '#eff6ff'
  },
  many: {
    accent: '#0ea5e9',
    accentMuted: '#bae6fd',
    headerBackground: 'rgba(236, 254, 255, 0.97)',
    headerText: '#075985',
    headerBorder: 'rgba(191, 219, 254, 0.8)',
    headerChipBackground: 'rgba(224, 242, 254, 0.95)',
    headerChipText: '#0284c7',
    rowGradientFrom: 'rgba(240, 253, 255, 0.9)',
    rowGradientTo: 'rgba(224, 242, 255, 0.7)',
    rowBorder: 'rgba(125, 211, 252, 0.8)',
    chipBackground: 'rgba(224, 242, 254, 0.95)',
    chipText: '#0ea5e9',
    chipBorder: 'rgba(125, 211, 252, 1)',
    cardBorder: '#7dd3fc',
    cardShadow: '0 25px 60px rgba(14, 165, 233, 0.2)',
    cardGradientFrom: '#ffffff',
    cardGradientTo: '#ecfeff'
  }
}

const getGroupThemeForCount = (count: number): GroupColorTheme => {
  if (count >= 5) return groupColorThemes.many
  if (count === 4) return groupColorThemes.quad
  if (count === 3) return groupColorThemes.trio
  if (count === 2) return groupColorThemes.pair
  return groupColorThemes.single
}

const toNullable = (value: string): string | null => {
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

const applyTeamSelection = (values: FormState, team: TeamSelection | null): FormState => ({
  ...values,
  team_id: team?.id ?? '',
  team_name: team?.name ?? '',
  team_logo: team?.logo ?? ''
})

const toFormState = (record: MemberRecord): FormState => ({
  name: record.name,
  email: record.email,
  group_label: record.group_label ?? '',
  team_id: record.team_id ?? '',
  team_name: record.team_name ?? '',
  team_logo: record.team_logo ?? '',
  account_password: record.account_password ?? '',
  account_number: record.account_number ?? '',
  date_of_birth: record.date_of_birth ?? '',
  membership_type: record.membership_type ?? '',
  member_age_type: record.member_age_type ?? '',
  phone_number: record.phone_number ?? '',
  address: record.address ?? '',
  post_code: record.post_code ?? '',
  membership_price: record.membership_price ?? '',
  status: record.status
})

const valuesToPayload = (values: FormState): MemberCreatePayload => ({
  name: values.name.trim(),
  email: values.email.trim(),
  group_label: toNullable(values.group_label),
  team_id: toNullable(values.team_id),
  team_name: toNullable(values.team_name),
  team_logo: toNullable(values.team_logo),
  account_password: toNullable(values.account_password),
  account_number: toNullable(values.account_number),
  date_of_birth: toNullable(values.date_of_birth),
  membership_type: toNullable(values.membership_type),
  member_age_type: toNullable(values.member_age_type),
  phone_number: toNullable(values.phone_number),
  address: toNullable(values.address),
  post_code: toNullable(values.post_code),
  membership_price: toNullable(values.membership_price),
  status: values.status
})

const createTemporaryRecord = (id: string, team?: TeamSelection | null): MemberRecord => ({
  id,
  organization_id: '',
  name: '',
  email: '',
  group_label: null,
  team_id: team?.id ?? null,
  team_name: team?.name ?? null,
  team_logo: team?.logo ?? null,
  account_password: null,
  account_number: null,
  date_of_birth: null,
  membership_type: null,
  member_age_type: null,
  phone_number: null,
  address: null,
  post_code: null,
  membership_price: null,
  vendor_id: null,
  vendor_name: null,
  status: 'ACTIVE',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
})

const createInlineRow = (team?: TeamSelection | null): MemberRow => {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `temp-${Date.now()}`
  const record = createTemporaryRecord(id, team)
  const initialValues = team ? applyTeamSelection({ ...emptyFormState }, team) : { ...emptyFormState }
  return {
    id,
    record,
    values: initialValues,
    dirty: false,
    saving: false,
    deleting: false,
    error: null,
    isNew: true
  }
}

const computeDirty = (values: FormState, record: MemberRecord): boolean => {
  const baseline = toFormState(record)
  return (Object.keys(values) as Array<keyof FormState>).some(key => baseline[key] !== values[key])
}

const MembersPage = () => {
  const { status, token } = useSession()
  const { formatCurrency, convertToBase, convertFromBase } = useCurrency()

  const [rows, setRows] = useState<MemberRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [viewState, setViewState] = useState<ViewState>({ status: 'idle' })
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [teamFilter, setTeamFilter] = useState<TeamSelection | null>(null)
  const [statusFilter, setStatusFilter] = useState<'ALL' | MemberStatus>('ALL')

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [modalValues, setModalValues] = useState<FormState>(emptyFormState)
  const [modalMemberId, setModalMemberId] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [modalSaving, setModalSaving] = useState(false)
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false)
  const [teamModalSelection, setTeamModalSelection] = useState<TeamSelection | null>(null)
  const [teamModalError, setTeamModalError] = useState<string | null>(null)

  const formatMembershipPriceForInput = useCallback(
    (value: string | null): string => {
      const numeric = parseMembershipPrice(value ?? '')
      if (!numeric) {
        return ''
      }
      const converted = convertFromBase(numeric)
      if (!Number.isFinite(converted) || converted <= 0) {
        return ''
      }
      const rounded = Math.round(converted * 100) / 100
      return Number(rounded.toFixed(2)).toString()
    },
    [convertFromBase]
  )

  const normalizeMembershipPriceForPayload = useCallback(
    (value: string): string | null => {
      if (!value.trim()) {
        return null
      }
      const numeric = parseMembershipPrice(value)
      if (!numeric) {
        return null
      }
      const baseValue = convertToBase(numeric)
      if (!Number.isFinite(baseValue) || baseValue <= 0) {
        return null
      }
      const rounded = Math.round(baseValue * 100) / 100
      return rounded.toFixed(2)
    },
    [convertToBase]
  )

  const buildRow = useCallback(
    (record: MemberRecord): MemberRow => {
      const baseValues = toFormState(record)
      const membershipPriceDisplay = formatMembershipPriceForInput(record.membership_price)
      return {
        id: record.id,
        record,
        values: { ...baseValues, membership_price: membershipPriceDisplay },
        dirty: false,
        saving: false,
        deleting: false,
        error: null,
        isNew: false
      }
    },
    [formatMembershipPriceForInput]
  )
  const [manualTeams, setManualTeams] = useState<TeamSelection[]>([])

  useEffect(() => {
    if (!teamFilter) {
      setSearch('')
      setDebouncedSearch('')
      setStatusFilter('ALL')
      return
    }
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(handle)
  }, [search, teamFilter])

  const loadMembers = useCallback(async () => {
    if (!token) {
      setLoadError('Session expired. Please sign in again.')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setLoadError(null)
    const result = await fetchMembers(token)
    if (!result.ok) {
      setLoadError(result.error)
      setIsLoading(false)
      return
    }
    const mapped = result.data.data.map(buildRow)
    setRows(mapped)
    setIsLoading(false)
  }, [buildRow, token])

  const authError = <T,>(): Promise<ApiResult<T>> =>
    Promise.resolve({ ok: false as const, error: 'Session expired. Please sign in again.', status: 401 })

  const handleBulkMembersDownload = useCallback(() => {
    if (!token) {
      return authError<DownloadPayload>()
    }
    return downloadMembersCsv(token)
  }, [token])

  const handleMembersTemplateDownload = useCallback(() => {
    if (!token) {
      return authError<DownloadPayload>()
    }
    return downloadMembersCsv(token, { template: true })
  }, [token])

  const handleBulkMembersUpload = useCallback(
    (file: File) => {
      if (!token) {
        return authError<BulkImportResponse>()
      }
      return uploadMembersSpreadsheet(token, file)
    },
    [token]
  )

  useEffect(() => {
    if (status !== 'authenticated') return
    loadMembers()
  }, [loadMembers, status])

  const showBanner = useCallback((state: ViewState) => {
    setViewState(state)
    if (state.status !== 'idle') {
      setTimeout(() => {
        setViewState(current => (current === state ? { status: 'idle' } : current))
      }, 3500)
    }
  }, [])

  const validateGroupTeamConstraint = useCallback(
    (params: { groupLabel: string | null | undefined; teamId: string | null | undefined; excludeRowId?: string; excludeMemberId?: string }) => {
      const normalizedLabel = (params.groupLabel ?? '').trim()
      if (!normalizedLabel.length) {
        return null
      }
      const normalizedTeamId = (params.teamId ?? '').trim()
      if (!normalizedTeamId.length) {
        return 'Team selection is required.'
      }

      const conflict = rows.find(other => {
        if (params.excludeRowId && other.id === params.excludeRowId) return false
        if (params.excludeMemberId && other.record.id === params.excludeMemberId) return false
        const otherLabel = (other.values.group_label ?? '').trim()
        if (otherLabel !== normalizedLabel) {
          return false
        }
        const otherTeamId = (other.values.team_id || other.record.team_id || '').trim()
        return otherTeamId.length > 0 && otherTeamId !== normalizedTeamId
      })

      if (conflict) {
        const conflictTeam = (conflict.values.team_name || conflict.record.team_name || 'another team').trim() || 'another team'
        return `Group "${normalizedLabel}" is already associated with ${conflictTeam}.`
      }

      return null
    },
    [rows]
  )

  const handleRowChange = (rowId: string, key: keyof FormState, value: string) => {
    setRows(prev =>
      prev.map(row => {
        if (row.id !== rowId) return row
        const nextValues = { ...row.values, [key]: value }
        return {
          ...row,
          values: nextValues,
          dirty: computeDirty(nextValues, row.record),
          error: null
        }
      })
    )
  }

  const handleRowSave = async (rowId: string) => {
    const row = rows.find(item => item.id === rowId)
    if (!row || !token) return
    if (!row.dirty) {
      showBanner({ status: 'error', message: 'No changes to save for this member.' })
      return
    }

    setRows(prev =>
      prev.map(item => (item.id === rowId ? { ...item, saving: true, error: null } : item))
    )

    const payload = valuesToPayload(row.values)
    if (!payload.name || !payload.email) {
      setRows(prev =>
        prev.map(item =>
          item.id === rowId ? { ...item, saving: false, error: 'Name and email are required.' } : item
        )
      )
      showBanner({ status: 'error', message: 'Name and email are required.' })
      return
    }
    if (!payload.team_id || !payload.team_name) {
      setRows(prev =>
        prev.map(item =>
          item.id === rowId ? { ...item, saving: false, error: 'Team selection is required.' } : item
        )
      )
      showBanner({ status: 'error', message: 'Team selection is required.' })
      return
    }

    const membershipPriceBase = normalizeMembershipPriceForPayload(row.values.membership_price)
    if (!membershipPriceBase) {
      setRows(prev =>
        prev.map(item =>
          item.id === rowId ? { ...item, saving: false, error: 'Enter a valid membership price.' } : item
        )
      )
      showBanner({ status: 'error', message: 'Enter a valid membership price.' })
      return
    }

    const groupConstraintError = validateGroupTeamConstraint({
      groupLabel: payload.group_label,
      teamId: payload.team_id,
      excludeRowId: row.id,
      excludeMemberId: row.record.id
    })
    if (groupConstraintError) {
      setRows(prev =>
        prev.map(item =>
          item.id === rowId ? { ...item, saving: false, error: groupConstraintError } : item
        )
      )
      showBanner({ status: 'error', message: groupConstraintError })
      return
    }

    payload.membership_price = membershipPriceBase

    if (row.isNew) {
      const result = await createMember(token, payload)
      if (!result.ok) {
        setRows(prev =>
          prev.map(item =>
            item.id === rowId ? { ...item, saving: false, error: result.error } : item
          )
        )
        showBanner({ status: 'error', message: result.error })
        return
      }
      const persistedRow = buildRow(result.data.data)
      setRows(prev =>
        prev.map(item => (item.id === rowId ? persistedRow : item))
      )
      showBanner({ status: 'success', message: 'Member added successfully.' })
      return
    }

    const result = await updateMember(token, rowId, payload as MemberUpdatePayload)

    if (!result.ok) {
      setRows(prev =>
        prev.map(item =>
          item.id === rowId ? { ...item, saving: false, error: result.error } : item
        )
      )
      showBanner({ status: 'error', message: result.error })
      return
    }

    const updatedRow = buildRow(result.data.data)
    setRows(prev =>
      prev.map(item =>
        item.id === rowId ? { ...updatedRow, error: null } : item
      )
    )
    showBanner({ status: 'success', message: 'Member updated successfully.' })
  }

  const handleRowDelete = async (rowId: string) => {
    const row = rows.find(item => item.id === rowId)
    if (!row) return
    if (row.isNew) {
      setRows(prev => prev.filter(item => item.id !== rowId))
      return
    }
    if (!token) return
    const confirmed = window.confirm('Remove this member? This cannot be undone.')
    if (!confirmed) return
    setRows(prev =>
      prev.map(item => (item.id === rowId ? { ...item, deleting: true, error: null } : item))
    )
    const result = await deleteMember(token, rowId)
    if (!result.ok) {
      setRows(prev =>
        prev.map(item =>
          item.id === rowId ? { ...item, deleting: false, error: result.error } : item
        )
      )
      showBanner({ status: 'error', message: result.error })
      return
    }
    setRows(prev => prev.filter(item => item.id !== rowId))
    showBanner({ status: 'success', message: 'Member removed.' })
  }

const handleOpenModal = (mode: 'create' | 'edit', member?: MemberRow, overrides?: Partial<FormState>) => {
  setModalMode(mode)
  if (mode === 'edit' && member) {
    setModalMemberId(member.id)
    setModalValues(member.values)
  } else {
    setModalMemberId(null)
    const base = { ...emptyFormState }
    setModalValues(overrides ? { ...base, ...overrides } : base)
  }
  setModalError(null)
  setModalOpen(true)
}

  const handleAddMember = () => {
    if (!teamFilter) {
      showBanner({ status: 'error', message: 'Select a team before adding members.' })
      return
    }
    if (viewMode === 'table') {
      setRows(prev => [createInlineRow(teamFilter), ...prev])
    } else {
      const initialValues = applyTeamSelection({ ...emptyFormState }, teamFilter)
      handleOpenModal('create', undefined, initialValues)
    }
  }

  const handleTeamModalClose = () => {
    setIsAddTeamModalOpen(false)
    setTeamModalError(null)
    setTeamModalSelection(null)
  }

  const handleTeamModalSubmit = () => {
    if (!teamModalSelection) {
      setTeamModalError('Select a team to continue.')
      return
    }
    setManualTeams(prev => {
      if (prev.some(team => team.id === teamModalSelection.id)) {
        return prev
      }
      return [...prev, teamModalSelection]
    })
    setTeamFilter(teamModalSelection)
    handleTeamModalClose()
  }

  const handleModalClose = () => {
    setModalOpen(false)
    setModalError(null)
    setModalSaving(false)
    if (modalMode === 'create') {
      setModalValues(emptyFormState)
    }
  }

  const handleModalValueChange = (key: keyof FormState, value: string) => {
    setModalValues(prev => ({ ...prev, [key]: value }))
  }

  const handleModalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) {
      setModalError('Session expired. Please sign in again.')
      return
    }
    if (!modalValues.name.trim() || !modalValues.email.trim()) {
      setModalError('Name and email are required.')
      return
    }
    const membershipPriceBase = normalizeMembershipPriceForPayload(modalValues.membership_price)
    if (!membershipPriceBase) {
      setModalError('Enter a valid membership price.')
      return
    }

    setModalSaving(true)
    setModalError(null)
    const payload = valuesToPayload(modalValues)
    payload.membership_price = membershipPriceBase
    if (!payload.team_id || !payload.team_name) {
      setModalError('Team selection is required.')
      setModalSaving(false)
      return
    }
    const groupConflict = validateGroupTeamConstraint({
      groupLabel: payload.group_label,
      teamId: payload.team_id,
      excludeMemberId: modalMode === 'edit' ? modalMemberId ?? undefined : undefined
    })
    if (groupConflict) {
      setModalError(groupConflict)
      setModalSaving(false)
      return
    }

    if (modalMode === 'create') {
      const result = await createMember(token, payload)
      if (!result.ok) {
        setModalError(result.error)
        setModalSaving(false)
        return
      }
      const newRow = buildRow(result.data.data)
      setRows(prev => [newRow, ...prev])
      setModalSaving(false)
      handleModalClose()
      showBanner({ status: 'success', message: 'Member added successfully.' })
      return
    }

    if (!modalMemberId) {
      setModalError('Missing member identifier.')
      setModalSaving(false)
      return
    }

    const result = await updateMember(token, modalMemberId, payload)
    if (!result.ok) {
      setModalError(result.error)
      setModalSaving(false)
      return
    }

    const updatedRow = buildRow(result.data.data)
    setRows(prev =>
      prev.map(item => (item.id === modalMemberId ? { ...updatedRow } : item))
    )
    setModalSaving(false)
    handleModalClose()
    showBanner({ status: 'success', message: 'Member updated via modal.' })
  }

  const teamStatsById = useMemo(() => buildTeamStatsMap(rows), [rows])

  const directoryTeams = useMemo<TeamSelection[]>(() => {
    const map = new Map<string, TeamSelection>()
    rows.forEach(row => {
      const id = (row.values.team_id || row.record.team_id || '').trim()
      const name = (row.values.team_name || row.record.team_name || '').trim()
      if (!id || !name) {
        return
      }
      if (!map.has(id)) {
        map.set(id, {
          id,
          name,
          logo: row.values.team_logo || row.record.team_logo || null
        })
      }
    })
    manualTeams.forEach(team => {
      if (!map.has(team.id)) {
        map.set(team.id, team)
      }
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [manualTeams, rows])

  const overallStats = useMemo(() => aggregateStatsForRows(rows), [rows])

    const filteredRows = useMemo(() => {
    if (!teamFilter) {
      return []
    }
    const normalizedSearch = debouncedSearch.toLowerCase()
    return rows.filter(row => {
      const rowTeamId = (row.values.team_id || row.record.team_id || '').trim()
      if (rowTeamId !== teamFilter.id) {
        return false
      }

      const rowStatus = (row.values.status || row.record.status || 'ACTIVE') as MemberStatus
      if (statusFilter !== 'ALL' && rowStatus !== statusFilter) {
        return false
      }

      if (normalizedSearch.length) {
        const searchableFields: string[] = [
          row.values.name || row.record.name || '',
          row.values.email || row.record.email || '',
          row.values.group_label || row.record.group_label || '',
          row.values.membership_type || row.record.membership_type || '',
          row.values.address || row.record.address || '',
          row.values.post_code || row.record.post_code || '',
          row.values.phone_number || row.record.phone_number || ''
        ]
        const haystack = searchableFields
          .map(value => (typeof value === 'string' ? value.toLowerCase() : ''))
          .join(' ')
        if (!haystack.includes(normalizedSearch)) {
          return false
        }
      }

      return true
    })
  }, [debouncedSearch, rows, statusFilter, teamFilter])

  const groupedDisplay = useMemo(() => {
    const groupsMap = new Map<string, { label: string; rows: MemberRow[]; allBanned: boolean }>()
    const singles: MemberRow[] = []
    filteredRows.forEach(row => {
      const groupSource = row.record.group_label ?? ''
      const label = groupSource.trim()
      if (!label.length) {
        singles.push(row)
        return
      }
      if (!groupsMap.has(label)) {
        groupsMap.set(label, { label, rows: [], allBanned: true })
      }
      const groupEntry = groupsMap.get(label)!
      groupEntry.rows.push(row)
      const effectiveStatus = (row.values.status ?? row.record.status) as MemberStatus
      if (groupEntry.allBanned && effectiveStatus !== 'BANNED') {
        groupEntry.allBanned = false
      }
    })
    const grouped = Array.from(groupsMap.values())
      .map(group => {
        const theme = group.allBanned
          ? {
              accent: '#fb7185',
              accentMuted: '#fecdd3',
              headerBackground: 'rgba(254, 242, 242, 0.96)',
              headerText: '#b91c1c',
              headerBorder: 'rgba(254, 202, 202, 0.9)',
              headerChipBackground: 'rgba(254, 226, 226, 0.95)',
              headerChipText: '#b91c1c',
              rowGradientFrom: 'rgba(254, 242, 242, 0.9)',
              rowGradientTo: 'rgba(254, 226, 226, 0.7)',
              rowBorder: 'rgba(252, 165, 165, 0.8)',
              chipBackground: 'rgba(254, 226, 226, 0.95)',
              chipText: '#b91c1c',
              chipBorder: 'rgba(248, 113, 113, 1)',
              cardBorder: '#fecdd3',
              cardShadow: '0 25px 60px rgba(248, 113, 113, 0.18)',
              cardGradientFrom: '#fff5f5',
              cardGradientTo: '#fee2e2'
            }
          : getGroupThemeForCount(group.rows.length)
        return {
          ...group,
          theme,
          allBanned: group.allBanned
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
    const groupCounts = new Map(grouped.map(group => [group.label, group.rows.length]))
    const groupMeta = new Map(grouped.map(group => [group.label, group]))
    return { grouped, singles, groupCounts, groupMeta }
  }, [filteredRows])

  if (isLoading) {
    return <LoadingScreen />
  }

  if (loadError) {
    return (
      <DashboardLayout
        header={<h1 className="text-3xl font-bold text-slate-900">Members</h1>}
      >
        <div className="rounded-3xl border border-rose-200 bg-white p-10 text-center text-rose-600 shadow-xl">
          <p className="text-lg font-semibold">We could not load your member directory.</p>
          <p className="mt-2 text-sm">{loadError}</p>
          <button
            type="button"
            onClick={loadMembers}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            <RefreshCcw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </DashboardLayout>
    )
  }

  const renderSheetRow = (row: MemberRow, options?: { highlight?: boolean; theme?: GroupColorTheme }) => {
    const highlight = options?.highlight ?? false
    const theme = options?.theme
    const resolvedStatus = (row.values.status ?? row.record.status) as MemberStatus
    const isBannedMember = resolvedStatus === 'BANNED'
    const rowBackgroundClass = row.dirty ? 'bg-indigo-50/40' : highlight ? '' : 'bg-white'
    const groupedRowStyle =
      isBannedMember
        ? {
            backgroundImage: 'linear-gradient(120deg, rgba(254,242,242,0.95), rgba(254,226,226,0.75))',
            borderLeft: '4px solid #dc2626',
            borderTop: '1px solid rgba(248,113,113,0.4)',
            borderBottom: '1px solid rgba(248,113,113,0.4)'
          }
        : highlight && theme
          ? {
              backgroundImage: `linear-gradient(120deg, ${theme.rowGradientFrom}, ${theme.rowGradientTo})`,
              borderLeft: `4px solid ${theme.accent}`,
              borderTop: `1px solid ${theme.rowBorder}`,
              borderBottom: `1px solid ${theme.rowBorder}`
            }
          : highlight
            ? {
                backgroundImage: 'linear-gradient(120deg, rgba(238,233,254,0.9), rgba(226,232,255,0.6))',
                borderLeft: '4px solid rgba(139,92,246,0.6)'
              }
            : undefined

    return (
      <tr key={row.id} className={`relative transition-colors ${rowBackgroundClass}`} style={groupedRowStyle}>
      {sheetFields.map(field => {
        if (field.key === 'group_label') {
          const groupValue = row.values.group_label
          return (
            <td key={`${row.id}-${field.key}`} className="px-4 py-3">
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={groupValue}
                  placeholder={field.placeholder}
                  onChange={event => handleRowChange(row.id, 'group_label', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-700 outline-none focus:border-[#2563eb]"
                />
              </div>
            </td>
          )
        }

        if (field.type === 'select') {
          return (
            <td key={`${row.id}-${field.key}`} className="px-4 py-3">
              <select
                value={row.values[field.key as keyof FormState] as MemberStatus}
                onChange={event => handleRowChange(row.id, field.key as keyof FormState, event.target.value as MemberStatus)}
                className={getStatusSelectClasses(row.values[field.key as keyof FormState] as MemberStatus)}
              >
                {(field.options ?? memberStatusOptions).map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </td>
          )
        }

        return (
          <td key={`${row.id}-${field.key}`} className="px-4 py-3">
            <input
              type="text"
              value={row.values[field.key as keyof FormState]}
              placeholder={field.placeholder}
              onChange={event => handleRowChange(row.id, field.key as keyof FormState, event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-700 outline-none focus:border-[#2563eb]"
            />
          </td>
        )
      })}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2 text-xs font-semibold">
          <button
            type="button"
            disabled={row.saving || !row.dirty}
            onClick={() => handleRowSave(row.id)}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {row.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
          <button
            type="button"
            disabled={row.deleting}
            onClick={() => handleRowDelete(row.id)}
            className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {row.deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </button>
        </div>
        {row.error && (
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-rose-600">
            {row.error}
          </p>
        )}
      </td>
      </tr>
    )
  }

  const bannerText =
    viewState.status === 'loading'
      ? viewState.message ?? 'Working...'
      : viewState.status === 'success' || viewState.status === 'error'
        ? viewState.message
        : ''

  const bannerClass =
    viewState.status === 'success'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
      : viewState.status === 'error'
        ? 'bg-rose-50 text-rose-700 border border-rose-100'
        : 'bg-slate-900 text-white border border-slate-800'

  return (
    <DashboardLayout
      header={
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563eb]">Members</p>
          <h1 className="text-4xl font-bold text-slate-900">Accounts & spreadsheets</h1>
          <p className="text-base text-slate-500">
            Keep every membership credential, team assignment, and address detail at your fingertips. Switch between an
            interactive sheet or a card directory whenever you need.
          </p>
        </div>
      }
      headerActions={
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-white/60 bg-white px-4 py-2 text-sm font-semibold text-slate-500 shadow-sm">
            <span className="text-slate-900">{filteredRows.length}</span>&nbsp;members&nbsp;visible
          </div>
          <BulkActionsButton
            triggerLabel="Import / export members"
            title="Import or export members"
            description="Seed large rosters with a spreadsheet upload or grab the live CSV to reconcile data in your ERP."
            note="Accepts CSV or Excel files up to 10MB"
            columns={MEMBER_BULK_COLUMNS}
            downloadData={handleBulkMembersDownload}
            downloadTemplate={handleMembersTemplateDownload}
            dataFallbackName="members.csv"
            templateFallbackName="members-template.csv"
            uploadConfig={{
              label: 'Upload CSV / Excel',
              onUpload: handleBulkMembersUpload,
              onComplete: loadMembers
            }}
            className="inline-flex"
          />
        </div>
      }
    >
      {viewState.status !== 'idle' && (
        <div className={`mb-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${bannerClass}`}>
          {viewState.status === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
          {bannerText}
        </div>
      )}

      <section className="mt-8 rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <div className="self-start inline-flex items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white">
              <UsersRound className="h-4 w-4" />
              Team insights
            </div>
            <h2 className="text-2xl font-semibold text-slate-900">Pick a team to manage members</h2>
            <p className="text-sm text-slate-500">Totals update automatically as you add, edit, or ban members.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {teamFilter && (
              <button
                type="button"
                onClick={() => setTeamFilter(null)}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
              >
                Clear selection
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setTeamModalSelection(null)
                setTeamModalError(null)
                setIsAddTeamModalOpen(true)
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#cbd6ff] bg-white px-4 py-2 text-xs font-semibold text-[#1d4ed8] transition hover:border-[#1d4ed8]"
            >
              <Plus className="h-4 w-4" />
              Add team
            </button>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Total active members</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{overallStats.active}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Total banned members</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{overallStats.banned}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Total membership cost</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{formatCurrency(overallStats.totalCost)}</p>
          </div>
        </div>
        <div className="mt-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Teams</p>
            <h3 className="text-lg font-semibold text-slate-900">
              {directoryTeams.length ? `${directoryTeams.length} team${directoryTeams.length === 1 ? '' : 's'}` : 'No teams yet'}
            </h3>
          </div>
          {directoryTeams.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {directoryTeams.map(team => {
                const stats = teamStatsById.get(team.id) ?? createEmptyStats()
                const isSelected = teamFilter?.id === team.id
                const buttonClass = isSelected
                  ? 'border-indigo-300 bg-gradient-to-br from-white via-indigo-50 to-white shadow-[0_20px_40px_rgba(99,102,241,0.15)]'
                  : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow-lg'
                return (
                  <button
                    type="button"
                    key={team.id}
                    onClick={() => setTeamFilter(team)}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${buttonClass}`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {team.logo ? (
                          <img
                            src={team.logo}
                            alt={`${team.name} logo`}
                            className="h-12 w-12 rounded-2xl border border-indigo-50 object-cover"
                          />
                        ) : (
                          <div
                            className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
                              isSelected ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'
                            }`}
                          >
                            {team.name.slice(0, 2)}
                          </div>
                        )}
                        <div>
                          <p className="text-base font-semibold text-slate-900">{team.name}</p>
                          <p className="text-xs text-slate-500">
                            {stats.totalMembers} member{stats.totalMembers === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Total Membership value</p>
                        <p className="text-sm font-semibold text-slate-900">{formatCurrency(stats.totalCost)}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                        {stats.active} Active
                      </span>
                      <span className="inline-flex items-center rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
                        {stats.banned} Banned
                      </span>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                        {formatCurrency(stats.totalCost)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm text-slate-500">
              You have no teams yet. Use "Add team" to search and add your first club.
            </div>
          )}
        </div>
      </section>

      {teamFilter ? (
        <section className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="self-start inline-flex items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white">
              <UsersRound className="h-4 w-4" />
              Member sheet
            </div>
            <h2 className="text-2xl font-semibold text-slate-900">{teamFilter.name} directory</h2>
            <p className="text-sm text-slate-500">Search, add, and manage every column without leaving the grid.</p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-slate-500">
                <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Search</span>
                <div className="mt-1 flex items-center gap-3">
                  <Search className="h-5 w-5" />
                  <input
                    type="search"
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder={`Search ${teamFilter.name} members`}
                    className="flex-1 bg-transparent text-base text-slate-700 outline-none"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-slate-500">
                <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Status filter</span>
                <select
                  value={statusFilter}
                  onChange={event => setStatusFilter(event.target.value as 'ALL' | MemberStatus)}
                  className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-[#2563eb]"
                >
                  <option value="ALL">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="BANNED">Banned</option>
                </select>
              </div>
              <div className="flex items-center rounded-2xl border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold ${
                    viewMode === 'table' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500'
                  }`}
                >
                  <Table className="h-4 w-4" />
                  Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold ${
                    viewMode === 'cards' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500'
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Cards
                </button>
              </div>
            </div>
            <div className="flex flex-col items-stretch justify-end gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={handleAddMember}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl"
              >
                <Plus className="h-4 w-4" />
                Add member
              </button>
            </div>
          </div>
        </div>

        {viewMode === 'table' ? (
          <div className="mt-6 overflow-x-auto rounded-[22px] border border-slate-100">
            <table className="min-w-[2000px] w-max divide-y divide-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <thead className="bg-slate-50">
                <tr>
                  {sheetFields.map(field => (
                    <th key={field.key as string} className="px-4 py-3">
                      {field.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
            <tbody className="divide-y divide-slate-100 text-[13px] lowercase text-slate-600">
              {groupedDisplay.grouped.map(group => (
              <Fragment key={group.label}>
                <tr>
                  <td
                    colSpan={sheetFields.length + 1}
                    className="px-4 py-3 text-left"
                      style={{
                        backgroundColor: group.theme.headerBackground,
                        borderLeft: `6px solid ${group.theme.accent}`,
                        borderTop: `1px solid ${group.theme.headerBorder}`,
                        borderBottom: `1px solid ${group.theme.headerBorder}`
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.35em]" style={{ color: group.theme.headerText }}>
                          <span className="font-bold">Group</span>
                          <span className="tracking-normal text-base font-bold">{group.label}</span>
                        </div>
                        <span
                          className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em]"
                          style={{
                            backgroundColor: group.theme.headerChipBackground,
                            color: group.theme.headerChipText,
                            border: `1px solid ${group.theme.headerBorder}`
                          }}
                        >
                          {group.rows.length} member{group.rows.length === 1 ? '' : 's'}
                        </span>
                        {group.allBanned && (
                          <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-rose-600">
                            All banned
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {group.rows.map(row => renderSheetRow(row, { highlight: true, theme: group.theme }))}
                </Fragment>
              ))}
              {groupedDisplay.singles.length > 0 && groupedDisplay.grouped.length > 0 && (
                <tr>
                  <td
                    colSpan={sheetFields.length + 1}
                    className="bg-slate-50 px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500"
                  >
                    Single members
                  </td>
                </tr>
              )}
              {groupedDisplay.singles.map(row => renderSheetRow(row))}
              {groupedDisplay.grouped.length === 0 && groupedDisplay.singles.length === 0 && (
                <tr>
                  <td colSpan={sheetFields.length + 1} className="px-4 py-6 text-center text-sm font-semibold text-slate-400">
                    No members found for this team yet. Use the Add member button to create one.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredRows
              .filter(row => !row.isNew)
              .map(row => {
                const trimmedGroupLabel = row.record.group_label?.trim() ?? ''
                const isGroupedCard = trimmedGroupLabel.length > 0
                const groupSize = isGroupedCard ? groupedDisplay.groupCounts.get(trimmedGroupLabel) ?? 1 : 0
                const groupMeta = isGroupedCard ? groupedDisplay.groupMeta.get(trimmedGroupLabel) ?? null : null
                const groupTheme = groupMeta?.theme ?? (isGroupedCard ? getGroupThemeForCount(groupSize || 1) : null)
                const isBannedCard = row.record.status === 'BANNED'
                const baseCardClass = 'rounded-[24px] border p-5 transition'
                const cardClass = isGroupedCard
                  ? `${baseCardClass} ring-1`
                  : `${baseCardClass} border-slate-100 bg-gradient-to-b from-white to-slate-50/60 shadow-[0_20px_60px_rgba(15,23,42,0.08)]`
                const themedCardStyle = groupTheme
                  ? {
                      borderColor: groupTheme.cardBorder,
                      boxShadow: groupTheme.cardShadow,
                      backgroundImage: `linear-gradient(180deg, ${groupTheme.cardGradientFrom}, ${groupTheme.cardGradientTo})`
                    }
                  : undefined
                const cardStyle = isBannedCard
                  ? {
                      borderColor: '#fecdd3',
                      boxShadow: '0 25px 60px rgba(225,29,72,0.25)',
                      backgroundImage: 'linear-gradient(180deg, rgba(254,242,242,0.98), rgba(254,226,226,0.88))'
                    }
                  : themedCardStyle

                const resolvedMembershipPrice = row.record.membership_price ?? row.values.membership_price ?? ''
                const membershipPriceValue = parseMembershipPrice(resolvedMembershipPrice)
                const membershipPriceLabel =
                  membershipPriceValue > 0 ? formatCurrency(membershipPriceValue) : resolvedMembershipPrice || '--'

                const bannedChipStyle = isBannedCard
                  ? {
                      backgroundColor: 'rgba(254,242,242,0.95)',
                      color: '#b91c1c',
                      border: '1px solid rgba(248,113,113,1)',
                      boxShadow: '0 12px 30px rgba(248,113,113,0.35)'
                    }
                  : undefined
                const groupChipStyle =
                  !isBannedCard && groupTheme
                    ? {
                        backgroundColor: groupTheme.chipBackground,
                        color: groupTheme.chipText,
                        border: `1px solid ${groupTheme.chipBorder}`,
                        boxShadow: `0 12px 30px ${groupTheme.accentMuted}55`
                      }
                    : undefined
                const secondaryGroupChipStyle =
                  !isBannedCard && groupTheme
                    ? {
                        backgroundColor: groupTheme.chipBackground,
                        color: groupTheme.chipText,
                        border: `1px solid ${groupTheme.chipBorder}`
                      }
                    : undefined

                return (
                  <div key={row.id} className={cardClass} style={cardStyle}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Member</p>
                        <h3 className="text-xl font-semibold text-slate-900">{row.record.name}</h3>
                        <p className="text-sm text-slate-500">{row.record.email}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isBannedCard ? 'border border-rose-200 bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
                        }`}
                      >
                        {row.record.membership_type ?? 'No plan'}
                      </span>
                    </div>
                    {isGroupedCard && (
                      <div
                        className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em]"
                        style={isBannedCard ? bannedChipStyle : groupChipStyle}
                      >
                        <UsersRound className="h-3.5 w-3.5" />
                        Group: {trimmedGroupLabel}
                      </div>
                    )}
                    <dl className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                      <CardItem label="Account #" value={row.record.account_number ?? '--'} />
                      <CardItem label="DOB" value={row.record.date_of_birth ?? '--'} />
                      <CardItem label="Age type" value={row.record.member_age_type ?? '--'} />
                      <CardItem label="Membership price" value={membershipPriceLabel} />
                      <div className="sm:col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Group</p>
                        <span
                          className={`mt-1 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                            isGroupedCard || isBannedCard ? '' : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                          style={
                            isBannedCard
                              ? bannedChipStyle
                              : isGroupedCard
                                ? secondaryGroupChipStyle
                                : undefined
                          }
                        >
                          {trimmedGroupLabel || 'Single member'}
                        </span>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Team</p>
                        <div className="mt-1 flex items-center gap-3 text-sm font-medium text-slate-700">
                          {row.record.team_logo ? (
                            <img
                              src={row.record.team_logo}
                              alt={`${row.record.team_name ?? 'Team'} logo`}
                              className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold uppercase text-slate-500">
                              {(row.record.team_name ?? '--').slice(0, 2)}
                            </div>
                          )}
                          <span>{row.record.team_name ?? '--'}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Status</p>
                        <span className={`${getStatusChipClasses(row.record.status)} mt-2`}>
                          {formatStatusLabel(row.record.status)}
                        </span>
                      </div>
                      <CardItem label="Address" value={row.record.address ?? '--'} full />
                    </dl>
                    <div className="mt-6 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenModal('edit', row)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#2563eb] hover:text-[#2563eb]"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        Edit via modal
                      </button>
                      <button
                        type="button"
                        disabled={row.deleting}
                        onClick={() => handleRowDelete(row.id)}
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
                No members yet for this team. Use the "Add member" button to populate the grid.
              </div>
            )}
          </div>
        )}
        </section>
      ) : (
        <section className="mt-8 rounded-[30px] border border-dashed border-slate-200 bg-slate-50/80 p-10 text-center text-slate-500">
          <p className="text-base font-semibold">Select a team to start managing members.</p>
          <p className="mt-2 text-sm">Use the team cards above to choose a club or add a new one.</p>
        </section>
      )}

      {modalOpen && (
        <Modal onClose={handleModalClose}>
          <form onSubmit={handleModalSubmit}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {modalMode === 'create' ? 'New member' : 'Edit member'}
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  {modalMode === 'create' ? 'Add member to sheet' : 'Update member profile'}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleModalClose}
                className="rounded-full border border-slate-200 p-2 text-slate-400 transition hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {modalValues.team_name && (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                {modalValues.team_logo ? (
                  <img
                    src={modalValues.team_logo}
                    alt={`${modalValues.team_name} logo`}
                    className="h-10 w-10 rounded-full border border-white/50 object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold uppercase text-slate-500">
                    {modalValues.team_name.slice(0, 2)}
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Team</p>
                  <p className="text-base font-semibold text-slate-900">{modalValues.team_name}</p>
                </div>
              </div>
            )}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {sheetFields.map(field => {
                const fieldKey = field.key as keyof FormState

                return (
                  <label key={field.key} className="text-xs font-semibold text-slate-700">
                    {field.label}
                    {field.type === 'select' ? (
                      <select
                        value={modalValues[fieldKey]}
                        onChange={event => handleModalValueChange(fieldKey, event.target.value as MemberStatus)}
                        className={`mt-2 ${getStatusSelectClasses(modalValues[fieldKey] as MemberStatus)}`}
                        disabled={modalSaving}
                      >
                        {(field.options ?? memberStatusOptions).map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={modalValues[fieldKey]}
                          onChange={event => handleModalValueChange(fieldKey, event.target.value)}
                          placeholder={field.placeholder}
                          disabled={modalSaving}
                          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-[#2563eb]/10"
                        />
                      </>
                    )}
                  </label>
                )
              })}
            </div>

            {modalError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
                {modalError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleModalClose}
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
                {modalMode === 'create' ? 'Add member' : 'Save member'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isAddTeamModalOpen && (
        <Modal onClose={handleTeamModalClose}>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Add a team</h2>
            <p className="mt-1 text-sm text-slate-500">Search for a team and start adding its members.</p>
            <div className="mt-4">
              <TeamSelect
                token={token}
                value={teamModalSelection}
                onChange={setTeamModalSelection}
                placeholder="Search team name"
              />
            </div>
            {teamModalError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600">
                {teamModalError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleTeamModalClose}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTeamModalSubmit}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-2 text-xs font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl"
              >
                <Plus className="h-4 w-4" />
                Continue
              </button>
            </div>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  )
}

type TeamSelectProps = {
  token: string | null
  value: TeamSelection | null
  onChange: (team: TeamSelection | null) => void
  placeholder?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  mode?: 'remote' | 'local'
  localOptions?: TeamSelection[]
  withMargin?: boolean
}

type TeamOption = TeamSelection & { country?: string | null }

const TeamSelect = ({
  token,
  value,
  onChange,
  placeholder,
  size = 'md',
  disabled,
  mode = 'remote',
  localOptions,
  withMargin = true
}: TeamSelectProps) => {
  const [query, setQuery] = useState(value?.name ?? '')
  const [debouncedQuery, setDebouncedQuery] = useState(value?.name ?? '')
  const [remoteOptions, setRemoteOptions] = useState<TeamOption[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null)
  const resolvedMode = mode

  useEffect(() => {
    setQuery(value?.name ?? '')
  }, [value?.id, value?.name])

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(handle)
  }, [query])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (containerRef.current && containerRef.current.contains(target)) {
        return
      }
      if (dropdownRef.current && dropdownRef.current.contains(target)) {
        return
      }
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (resolvedMode !== 'remote') {
      setIsLoading(false)
      setFetchError(null)
      setRemoteOptions([])
      return
    }
    if (!isOpen || !token || debouncedQuery.length < 1) {
      setRemoteOptions([])
      setFetchError(null)
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setFetchError(null)

    searchTeams(token, debouncedQuery, { limit: 20 })
      .then(result => {
        if (cancelled) return
        if (!result.ok) {
          setFetchError(result.error)
          setRemoteOptions([])
          return
        }
        const mapped: TeamOption[] = result.data.data.map(team => ({
          id: team.id,
          name: team.name,
          logo: team.logo ?? null,
          country: team.country ?? null
        }))
        setRemoteOptions(mapped)
      })
      .catch(error => {
        if (cancelled) return
        setFetchError(error instanceof Error ? error.message : 'Unable to load teams.')
        setRemoteOptions([])
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, isOpen, token, resolvedMode])

  useEffect(() => {
    if (!isOpen) {
      setDropdownStyle(null)
      return
    }

    const updatePosition = () => {
      if (!containerRef.current) {
        setDropdownStyle(null)
        return
      }
      const rect = containerRef.current.getBoundingClientRect()
      setDropdownStyle({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width
      })
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen])

  const filteredLocalOptions = useMemo<TeamOption[]>(() => {
    if (resolvedMode !== 'local') {
      return []
    }
    const source = localOptions ?? []
    const normalized = debouncedQuery.toLowerCase()
    return source
      .filter(option => (normalized.length ? option.name.toLowerCase().includes(normalized) : true))
      .map(option => ({
        id: option.id,
        name: option.name,
        logo: option.logo ?? null,
        country: null
      }))
  }, [debouncedQuery, localOptions, resolvedMode])

  const displayOptions = resolvedMode === 'local' ? filteredLocalOptions : remoteOptions
  const resolvedDisabled = Boolean(disabled || (resolvedMode === 'remote' && !token))
  const sizeClasses = size === 'sm' ? 'py-1 text-xs' : 'py-2 text-sm'
  const wrapperMarginClass = withMargin ? 'mt-2' : ''

  const helperMessage = (() => {
    if (resolvedMode === 'local') {
      if (!(localOptions?.length ?? 0)) {
        return 'No teams available yet.'
      }
      if (!displayOptions.length) {
        return 'No teams match your search.'
      }
      return null
    }
    if (!token) {
      return 'Sign in to search teams.'
    }
    if (fetchError) {
      return fetchError
    }
    if (!debouncedQuery.length) {
      return 'Start typing to search teams.'
    }
    if (!displayOptions.length && !isLoading) {
      return 'No teams found.'
    }
    return null
  })()

  const handleSelect = (team: TeamOption) => {
    onChange({
      id: team.id,
      name: team.name,
      logo: team.logo ?? null
    })
    setQuery(team.name)
    setIsOpen(false)
  }

  const handleClear = () => {
    onChange(null)
    setQuery('')
  }

  return (
    <div className={`relative ${wrapperMarginClass}`} ref={containerRef}>
      <div
        className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 ${sizeClasses} ${
          resolvedDisabled ? 'opacity-60' : ''
        }`}
      >
        {value?.logo ? (
          <img src={value.logo} alt={`${value.name} logo`} className="h-6 w-6 rounded-full border border-slate-200 object-cover" />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-[10px] font-semibold uppercase text-slate-500">
            {(value?.name ?? 'TM').slice(0, 2)}
          </div>
        )}
        <input
          type="text"
          value={query}
          onChange={event => {
            setQuery(event.target.value)
            if (!resolvedDisabled && !isOpen) {
              setIsOpen(true)
            }
          }}
          onFocus={() => {
            if (!resolvedDisabled) {
              setIsOpen(true)
            }
          }}
          placeholder={placeholder ?? 'Search team'}
          disabled={resolvedDisabled}
          className="flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
        />
        {value && !resolvedDisabled && (
          <button type="button" onClick={handleClear} className="text-slate-400 transition hover:text-slate-600" title="Clear team">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {isOpen &&
        dropdownStyle &&
        createPortal(
          <div
            ref={node => {
              dropdownRef.current = node
            }}
            className="fixed z-50 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
            style={{
              top: dropdownStyle.top,
              left: dropdownStyle.left,
              width: dropdownStyle.width
            }}
          >
            {isLoading && (
              <div className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching teams...
              </div>
            )}
            {!isLoading && helperMessage && <div className="px-4 py-3 text-sm text-slate-500">{helperMessage}</div>}
            {!isLoading && !helperMessage && (
              <ul className="py-1">
                {displayOptions.map(option => (
                  <li key={option.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => handleSelect(option)}
                    >
                      {option.logo ? (
                        <img src={option.logo} alt={`${option.name} logo`} className="h-8 w-8 rounded-full border border-slate-200 object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold uppercase text-slate-500">
                          {option.name.slice(0, 2)}
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span>{option.name}</span>
                        {option.country && <span className="text-xs font-normal text-slate-500">{option.country}</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}

const Modal = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
    <div
      className="absolute inset-0 z-0"
      role="button"
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={event => {
        if (event.key === 'Escape') onClose()
      }}
    />
    <div className="relative z-10 w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl">
      {children}
    </div>
  </div>
)

const CardItem = ({ label, value, full }: { label: string; value: string; full?: boolean }) => (
  <div className={full ? 'sm:col-span-2' : ''}>
    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">{label}</p>
    <p className="mt-1 text-sm font-medium text-slate-700">{value || '--'}</p>
  </div>
)

export default MembersPage
