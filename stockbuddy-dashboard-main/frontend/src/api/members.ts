import {
  apiDelete,
  apiDownload,
  apiGet,
  apiPost,
  apiRequest,
  apiUpload,
  type ApiResult,
  type DownloadPayload
} from './client'
import type {
  MemberCreatePayload,
  MemberDetailResponse,
  MemberListResponse,
  MemberUpdatePayload
} from '../types/members'
import type { BulkImportResponse } from '../types/imports'

type QueryValue = string | number | Array<string | number> | undefined

const buildQueryString = (params: Record<string, QueryValue>) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return
    if (Array.isArray(value)) {
      value.forEach(entry => {
        query.append(key, String(entry))
      })
      return
    }
    query.append(key, String(value))
  })
  const serialized = query.toString()
  return serialized.length ? `?${serialized}` : ''
}

export const fetchMembers = (
  token: string,
  params: { search?: string; teamNames?: string[] } = {}
): Promise<ApiResult<MemberListResponse>> => {
  const teamNames =
    params.teamNames?.map(name => name.trim()).filter(name => name.length) ?? undefined
  const query = buildQueryString({
    search: params.search && params.search.trim().length ? params.search.trim() : undefined,
    team_names: teamNames && teamNames.length ? teamNames : undefined
  })
  return apiGet<MemberListResponse>(`/members${query}`, { token })
}

export const createMember = (
  token: string,
  payload: MemberCreatePayload
): Promise<ApiResult<MemberDetailResponse>> => {
  return apiPost<MemberDetailResponse>('/members', payload, { token })
}

export const updateMember = (
  token: string,
  memberId: string,
  payload: MemberUpdatePayload
): Promise<ApiResult<MemberDetailResponse>> => {
  return apiRequest<MemberDetailResponse>(`/members/${memberId}`, {
    method: 'PUT',
    token,
    body: payload
  })
}

export const deleteMember = (
  token: string,
  memberId: string
): Promise<ApiResult<{ success: boolean }>> => {
  return apiDelete<{ success: boolean }>(`/members/${memberId}`, { token })
}

export const downloadMembersCsv = (
  token: string,
  params: { template?: boolean } = {}
): Promise<ApiResult<DownloadPayload>> => {
  const query = params.template ? '?template=1' : ''
  return apiDownload(`/members/export${query}`, { token })
}

export const uploadMembersSpreadsheet = (
  token: string,
  file: File
): Promise<ApiResult<BulkImportResponse>> => {
  const formData = new FormData()
  formData.append('file', file)
  return apiUpload<BulkImportResponse>('/members/import', formData, { token })
}
