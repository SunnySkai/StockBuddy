import express, { Response } from 'express'
import type { Express } from 'express'
import multer from 'multer'
import pLimit from 'p-limit'
import { requireLoggedInUser } from '../../decorators/require_param'
import { AuthenticatedRequest, Request } from '../../models/request'
import { createMember, deleteMember, listMembers, updateMember } from '../../daos/members'
import { Member, MemberCreateInput, MemberStatus, MemberUpdateInput } from '../../models/member'
import { apiFootballClient } from '../../services/api_football'
import { buildCsvContent, parseSpreadsheet, type ParsedSheetRow } from '../../helpers/spreadsheet'
import type { BulkImportSummary } from '../../models/bulk_import'

const route = express.Router()

const sendCsvResponse = (res: Response, filename: string, csv: string): void => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(`${CSV_BOM}${csv}`)
}

const toCsvRow = (member: Member): Record<string, unknown> => ({
  name: member.name,
  email: member.email,
  status: member.status,
  group_label: member.group_label ?? '',
  team_id: member.team_id ?? '',
  team_name: member.team_name ?? '',
  team_logo: member.team_logo ?? '',
  account_password: member.account_password ?? '',
  account_number: member.account_number ?? '',
  phone_number: member.phone_number ?? '',
  date_of_birth: member.date_of_birth ?? '',
  membership_type: member.membership_type ?? '',
  member_age_type: member.member_age_type ?? '',
  address: member.address ?? '',
  post_code: member.post_code ?? '',
  account_age: member.account_age ?? '',
  membership_price: member.membership_price ?? '',
  vendor_id: member.vendor_id ?? '',
  vendor_name: member.vendor_name ?? '',
  created_at: member.created_at,
  updated_at: member.updated_at
})
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
})
const CSV_BOM = '\ufeff'
const MEMBER_CSV_HEADERS = [
  'name',
  'email',
  'status',
  'group_label',
  'team_name',
  'account_password',
  'account_number',
  'phone_number',
  'date_of_birth',
  'membership_type',
  'member_age_type',
  'address',
  'post_code',
  'membership_price'
]
const MEMBER_TEMPLATE_HEADERS = [
  'name',
  'email',
  'status',
  'group_label',
  'team_name',
  'membership_price',
  'membership_type',
  'account_password',
  'account_number',
  'phone_number',
  'date_of_birth',
  'address',
  'post_code'
]
const MEMBER_REQUIRED_COLUMNS = ['name', 'email', 'team_name', 'membership_price']
const MAX_MEMBER_IMPORT_ROWS = 2000

type OrgContext =
  | {
      tenant: string
      organizationId: string
    }
  | null

const ensureOrgContext = (req: Request, res: Response): OrgContext => {
  const authRequest = req as AuthenticatedRequest
  const user = authRequest.user
  if (!user) {
    res.status(401).json({ success: false, message: 'Access denied.' })
    return null
  }
  if (!user.organization_id) {
    res.status(400).json({ success: false, message: 'Organization membership required.' })
    return null
  }
  return {
    tenant: req.tenant ?? '',
    organizationId: user.organization_id
  }
}

const toNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null
  }
  const normalized = String(value).trim()
  return normalized.length ? normalized : null
}

const toRequiredString = (value: unknown, label: string): string => {
  const normalized = toNullableString(value)
  if (!normalized) {
    throw new Error(`${label} is required.`)
  }
  return normalized
}

const toStringList = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null) {
    return undefined
  }

  const normalizedValues: string[] = []
  const pushValue = (raw: string) => {
    raw.split(',').forEach((segment) => {
      const normalized = toNullableString(segment)
      if (normalized) {
        normalizedValues.push(normalized)
      }
    })
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (typeof entry === 'string') {
        pushValue(entry)
      } else if (entry !== undefined && entry !== null) {
        pushValue(String(entry))
      }
    })
  } else if (typeof value === 'string') {
    pushValue(value)
  } else {
    pushValue(String(value))
  }

  return normalizedValues.length ? normalizedValues : undefined
}

const mergeStringLists = (...lists: Array<string[] | undefined | null>): string[] => {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const list of lists) {
    if (!list) {
      continue
    }
    list.forEach((value) => {
      if (typeof value !== 'string') {
        return
      }
      const trimmed = value.trim()
      if (!trimmed.length) {
        return
      }
      const key = trimmed.toLowerCase()
      if (seen.has(key)) {
        return
      }
      seen.add(key)
      merged.push(trimmed)
    })
  }
  return merged
}

type ApiFootballTeamRecord = {
  team?: {
    id?: number
    name?: string
    logo?: string | null
  }
}

type TeamLookup = {
  id: string
  name: string
  logo: string | null
}

type TeamAssignment = {
  team_id: string
  team_name: string
  team_logo: string | null
}

const teamLookupByName = new Map<string, TeamLookup>()
const teamLookupById = new Map<string, TeamLookup>()

const lookupTeamByName = async (teamName: string): Promise<TeamLookup> => {
  const normalized = teamName.trim().toLowerCase()
  if (!normalized.length) {
    throw new Error('team_name is required.')
  }
  const cached = teamLookupByName.get(normalized)
  if (cached) {
    return cached
  }
  try {
    const response = await apiFootballClient.getTeams<ApiFootballTeamRecord[]>({
      search: teamName.trim()
    })
    const records = Array.isArray(response.response) ? response.response : []
    const matched =
      records.find(
        (entry) => entry.team?.name?.trim().toLowerCase() === normalized
      ) ?? records[0]
    if (!matched?.team?.id) {
      throw new Error('No matching team found.')
    }
    const lookup: TeamLookup = {
      id: String(matched.team.id),
      name: matched.team.name ?? teamName,
      logo: matched.team.logo ?? null
    }
    teamLookupByName.set(normalized, lookup)
    teamLookupById.set(lookup.id, lookup)
    return lookup
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resolve team.'
    throw new Error(`Unable to resolve team "${teamName}". ${message}`)
  }
}

const lookupTeamById = async (teamId: string): Promise<TeamLookup> => {
  const normalized = teamId.trim()
  if (!normalized.length) {
    throw new Error('team_id is required.')
  }
  const cached = teamLookupById.get(normalized)
  if (cached) {
    return cached
  }
  try {
    const response = await apiFootballClient.getTeams<ApiFootballTeamRecord[]>({
      id: normalized
    })
    const record = Array.isArray(response.response) ? response.response[0] : undefined
    if (!record?.team?.id) {
      throw new Error('No matching team found.')
    }
    const lookup: TeamLookup = {
      id: String(record.team.id),
      name: record.team.name ?? `Team ${record.team.id}`,
      logo: record.team.logo ?? null
    }
    teamLookupById.set(lookup.id, lookup)
    teamLookupByName.set(lookup.name.trim().toLowerCase(), lookup)
    return lookup
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resolve team.'
    throw new Error(`Unable to resolve team ID "${teamId}". ${message}`)
  }
}

const ensureTeamAssignment = async (
  teamId: string | null,
  teamName: string | null,
  teamLogo: string | null
): Promise<TeamAssignment> => {
  if (teamId && teamName) {
    return {
      team_id: teamId,
      team_name: teamName,
      team_logo: teamLogo ?? null
    }
  }
  if (teamId && !teamName) {
    const lookup = await lookupTeamById(teamId)
    return {
      team_id: lookup.id,
      team_name: lookup.name,
      team_logo: teamLogo ?? lookup.logo ?? null
    }
  }
  if (!teamName) {
    throw new Error('team_name is required.')
  }
  const lookup = await lookupTeamByName(teamName)
  return {
    team_id: teamId ?? lookup.id,
    team_name: lookup.name,
    team_logo: teamLogo ?? lookup.logo ?? null
  }
}

const parseMemberStatus = (value: unknown, options?: { optional?: boolean }): MemberStatus | undefined => {
  const optional = options?.optional ?? false
  if (value === undefined || value === null) {
    if (optional) {
      return undefined
    }
    throw new Error('status must be ACTIVE or BANNED.')
  }
  const normalized = toNullableString(value)
  if (!normalized) {
    if (optional) {
      return undefined
    }
    throw new Error('status must be ACTIVE or BANNED.')
  }
  const candidate = normalized.toUpperCase()
  if (candidate === 'ACTIVE') {
    return 'ACTIVE'
  }
  if (candidate === 'BANNED' || candidate === 'CLOSED') {
    return 'BANNED'
  }
  throw new Error('status must be ACTIVE or BANNED.')
}

type FixtureParticipantFilters = {
  teamNames: string[]
  teamIds: string[]
}

const resolveFixtureParticipantFilters = async (fixtureId: string): Promise<FixtureParticipantFilters> => {
  const response = await apiFootballClient.getFixtureById<any>(fixtureId, { ttlMs: 60_000 })
  const fixture = Array.isArray(response?.response) ? response.response[0] : null
  if (!fixture) {
    throw new Error('Fixture not found.')
  }
  const teams = fixture?.teams ?? {}
  const rawNames: string[] = []
  const rawIds: string[] = []
  const appendTeam = (team: any) => {
    if (!team || typeof team !== 'object') {
      return
    }
    if (typeof team.name === 'string' && team.name.trim().length) {
      rawNames.push(team.name)
    }
    if (
      (typeof team.id === 'number' && Number.isFinite(team.id)) ||
      (typeof team.id === 'string' && team.id.trim().length)
    ) {
      rawIds.push(String(team.id))
    }
  }
  appendTeam(teams?.home)
  appendTeam(teams?.away)
  const teamNames = mergeStringLists(rawNames)
  const teamIds = mergeStringLists(rawIds)
  if (!teamNames.length && !teamIds.length) {
    throw new Error('Fixture teams unavailable for filtering members.')
  }
  return { teamNames, teamIds }
}

const normalizeMemberCreatePayload = async (body: unknown): Promise<MemberCreateInput> => {
  if (!body || typeof body !== 'object') {
    throw new Error('Payload must be an object.')
  }
  const payload = body as Record<string, unknown>
  const teamId = toNullableString(payload.team_id ?? payload.teamId)
  const teamName = toNullableString(payload.team_name ?? payload.teamName)
  const teamLogo = toNullableString(payload.team_logo ?? payload.teamLogo)
  const membershipPrice = toNullableString(payload.membership_price ?? payload.membershipPrice)

  if (!membershipPrice) {
    throw new Error('membership_price is required.')
  }

  const team = await ensureTeamAssignment(teamId, teamName, teamLogo)

  return {
    name: toRequiredString(payload.name, 'name'),
    email: toRequiredString(payload.email, 'email'),
    group_label: toNullableString(payload.group_label ?? payload.groupLabel),
    team_id: team.team_id,
    team_name: team.team_name,
    team_logo: team.team_logo,
    account_password: toNullableString(payload.account_password ?? payload.accountPassword),
    account_number: toNullableString(payload.account_number ?? payload.accountNumber),
    phone_number: toNullableString(payload.phone_number ?? payload.phoneNumber),
    date_of_birth: toNullableString(payload.date_of_birth ?? payload.dateOfBirth),
    membership_type: toNullableString(payload.membership_type ?? payload.membershipType),
    member_age_type: toNullableString(payload.member_age_type ?? payload.memberAgeType),
    address: toNullableString(payload.address),
    post_code: toNullableString(payload.post_code ?? payload.postCode),
    account_age: toNullableString(payload.account_age ?? payload.accountAge),
    membership_price: membershipPrice,
    bank: toNullableString(payload.bank),
    status: parseMemberStatus(payload.status, { optional: true })
  }
}

const normalizeMemberUpdatePayload = async (body: unknown): Promise<MemberUpdateInput> => {
  if (!body || typeof body !== 'object') {
    throw new Error('Payload must be an object.')
  }
  const payload = body as Record<string, unknown>
  const updates: MemberUpdateInput = {}

  type StringField = Exclude<keyof MemberUpdateInput, 'status'>
  const assignStringField = (field: StringField, value: unknown) => {
    if (value === undefined) {
      return
    }
    const normalizedValue = toNullableString(value)
    if (normalizedValue !== null) {
      updates[field] = normalizedValue
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
    updates.name = toRequiredString(payload.name, 'name')
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
    updates.email = toRequiredString(payload.email, 'email')
  }

  assignStringField('account_password', payload.account_password ?? payload.accountPassword)
  assignStringField('account_number', payload.account_number ?? payload.accountNumber)
  assignStringField('phone_number', payload.phone_number ?? payload.phoneNumber)
  assignStringField('date_of_birth', payload.date_of_birth ?? payload.dateOfBirth)
  assignStringField('membership_type', payload.membership_type ?? payload.membershipType)
  assignStringField('member_age_type', payload.member_age_type ?? payload.memberAgeType)
  assignStringField('address', payload.address)
  assignStringField('post_code', payload.post_code ?? payload.postCode)
  assignStringField('account_age', payload.account_age ?? payload.accountAge)
  assignStringField('membership_price', payload.membership_price ?? payload.membershipPrice)
  assignStringField('bank', payload.bank)
  assignStringField('group_label', payload.group_label ?? payload.groupLabel)
  assignStringField('team_id', payload.team_id ?? payload.teamId)
  assignStringField('team_name', payload.team_name ?? payload.teamName)
  assignStringField('team_logo', payload.team_logo ?? payload.teamLogo)
  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    updates.status = parseMemberStatus(payload.status)
  }

  const teamIdProvided =
    Object.prototype.hasOwnProperty.call(payload, 'team_id') ||
    Object.prototype.hasOwnProperty.call(payload, 'teamId')
  const teamNameProvided =
    Object.prototype.hasOwnProperty.call(payload, 'team_name') ||
    Object.prototype.hasOwnProperty.call(payload, 'teamName')

  if (teamIdProvided || teamNameProvided) {
    const providedTeamId = teamIdProvided ? toNullableString(payload.team_id ?? payload.teamId) : null
    const providedTeamName = teamNameProvided ? toNullableString(payload.team_name ?? payload.teamName) : null
    const team = await ensureTeamAssignment(providedTeamId, providedTeamName, updates.team_logo ?? null)
    updates.team_id = team.team_id
    updates.team_name = team.team_name
    updates.team_logo = team.team_logo
  }

  return updates
}

const handleError = (res: Response, error: unknown, defaultMessage: string): void => {
  const message = error instanceof Error ? error.message : defaultMessage
  res.status(400).json({ success: false, message })
}

const importMembersFromRows = async (
  tenant: string,
  organizationId: string,
  rows: ParsedSheetRow[]
): Promise<BulkImportSummary> => {
  const limiter = pLimit(5)
  const summary: BulkImportSummary = {
    processed: rows.length,
    created: 0,
    failed: 0,
    errors: []
  }

  await Promise.all(
    rows.map((row) =>
      limiter(async () => {
        try {
          const payload = await normalizeMemberCreatePayload(row.values)
          await createMember(tenant, organizationId, payload)
          summary.created += 1
        } catch (error) {
          summary.failed += 1
          const message = error instanceof Error ? error.message : 'Unable to import row.'
          summary.errors.push({ rowNumber: row.rowNumber, message })
        }
      })
    )
  )

  return summary
}

route.get(
  '/export',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) {
      return
    }
    try {
      const templateRequested =
        typeof req.query.template === 'string' &&
        ['1', 'true', 'yes'].includes(req.query.template.toLowerCase())
      if (templateRequested) {
        const templateRow = {
          name: 'Jane Doe',
          email: 'jane@example.com',
        status: 'ACTIVE',
        group_label: 'Hospitality',
        team_name: 'Arsenal',
        account_password: 'StrongPassword123',
        account_number: 'ACC123456',
        phone_number: '+44 7000 000000',
        date_of_birth: '1990-06-15',
        membership_type: 'Season Ticket',
        address: '123 Emirates Rd',
        post_code: 'N7 7AJ',
        membership_price: 2500
      }
        const csv = buildCsvContent(MEMBER_TEMPLATE_HEADERS, [templateRow])
        sendCsvResponse(res, 'members-template.csv', csv)
        return
      }
      const members = await listMembers(context.tenant, context.organizationId)
      const csvRows = members.map((member) => toCsvRow(member))
      const csv = buildCsvContent(MEMBER_CSV_HEADERS, csvRows)
      const filename = `members-${new Date().toISOString().split('T')[0]}.csv`
      sendCsvResponse(res, filename, csv)
    } catch (error) {
      handleError(res, error, 'Unable to export members.')
    }
  }
)

route.post(
  '/import',
  requireLoggedInUser(),
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) {
      return
    }
    const requestWithFile = req as Request & { file?: Express.Multer.File }
    const file = requestWithFile.file
    if (!file || !file.buffer?.length) {
      res.status(400).json({ success: false, message: 'Upload file is required.' })
      return
    }
    try {
      const parsed = parseSpreadsheet(file.buffer)
      if (!parsed.columns.length) {
        throw new Error('Add a header row to your spreadsheet before uploading.')
      }
      const missingColumns = MEMBER_REQUIRED_COLUMNS.filter(
        (column) => !parsed.columns.includes(column)
      )
      if (missingColumns.length) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`)
      }
      if (!parsed.rows.length) {
        throw new Error('No rows found to import.')
      }
      if (parsed.rows.length > MAX_MEMBER_IMPORT_ROWS) {
        throw new Error(`Please limit imports to ${MAX_MEMBER_IMPORT_ROWS} rows at a time.`)
      }
      const summary = await importMembersFromRows(
        context.tenant,
        context.organizationId,
        parsed.rows
      )
      res.json({ success: true, data: summary })
    } catch (error) {
      handleError(res, error, 'Unable to import members.')
    }
  }
)

route.get(
  '/',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) {
      return
    }

    try {
      const query = req.query as Record<string, unknown>
      const search = typeof query.search === 'string' ? query.search : undefined
      let teamNameFilters = mergeStringLists(
        toStringList(query['team_names']),
        toStringList(query['teamNames'])
      )
      let teamIdFilters = mergeStringLists(
        toStringList(query['team_ids']),
        toStringList(query['teamIds'])
      )
      const fixtureId = toNullableString(query['fixture_id'] ?? query['fixtureId'])
      const gameId = toNullableString(query['game_id'] ?? query['gameId'])
      const fixtureReference = fixtureId ?? gameId
      if (fixtureReference) {
        const fixtureFilters = await resolveFixtureParticipantFilters(fixtureReference)
        teamNameFilters = mergeStringLists(teamNameFilters, fixtureFilters.teamNames)
        teamIdFilters = mergeStringLists(teamIdFilters, fixtureFilters.teamIds)
      }
      const members = await listMembers(context.tenant, context.organizationId, {
        search,
        teamNames: teamNameFilters.length ? teamNameFilters : undefined,
        teamIds: teamIdFilters.length ? teamIdFilters : undefined,
        statuses: ['ACTIVE']
      })
      const activeMembers = members.filter((member) => member.status === 'ACTIVE')
      res.json({ success: true, data: activeMembers })
    } catch (error) {
      handleError(res, error, 'Unable to load members.')
    }
  }
)

route.post(
  '/',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) {
      return
    }

    try {
      const input = await normalizeMemberCreatePayload(req.body)
      const member = await createMember(context.tenant, context.organizationId, input)
      res.status(201).json({ success: true, data: member })
    } catch (error) {
      handleError(res, error, 'Unable to create member.')
    }
  }
)

route.put(
  '/:memberId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) {
      return
    }

    const memberId = typeof req.params.memberId === 'string' ? req.params.memberId.trim() : ''
    if (!memberId) {
      res.status(400).json({ success: false, message: 'memberId is required.' })
      return
    }

    try {
      const updates = await normalizeMemberUpdatePayload(req.body)
      const member = await updateMember(context.tenant, context.organizationId, memberId, updates)
      if (!member) {
        res.status(404).json({ success: false, message: 'Member not found.' })
        return
      }
      res.json({ success: true, data: member })
    } catch (error) {
      handleError(res, error, 'Unable to update member.')
    }
  }
)

route.delete(
  '/:memberId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const context = ensureOrgContext(req, res)
    if (!context) {
      return
    }

    const memberId = typeof req.params.memberId === 'string' ? req.params.memberId.trim() : ''
    if (!memberId) {
      res.status(400).json({ success: false, message: 'memberId is required.' })
      return
    }

    try {
      await deleteMember(context.tenant, context.organizationId, memberId)
      res.json({ success: true })
    } catch (error) {
      handleError(res, error, 'Unable to delete member.')
    }
  }
)

export = route
