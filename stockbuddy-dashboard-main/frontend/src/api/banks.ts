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
  BankCreatePayload,
  BankDetailResponse,
  BankListResponse,
  BankUpdatePayload
} from '../types/banks'
import type { BulkImportResponse } from '../types/imports'

const buildQueryString = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return
    query.append(key, String(value))
  })
  const serialized = query.toString()
  return serialized.length ? `?${serialized}` : ''
}

export const fetchBanks = (
  token: string,
  params: { search?: string } = {}
): Promise<ApiResult<BankListResponse>> => {
  const query = buildQueryString({
    search: params.search && params.search.trim().length ? params.search.trim() : undefined
  })
  return apiGet<BankListResponse>(`/banks${query}`, { token })
}

export const createBank = (
  token: string,
  payload: BankCreatePayload
): Promise<ApiResult<BankDetailResponse>> => {
  return apiPost<BankDetailResponse>('/banks', payload, { token })
}

export const updateBank = (
  token: string,
  bankId: string,
  payload: BankUpdatePayload
): Promise<ApiResult<BankDetailResponse>> => {
  return apiRequest<BankDetailResponse>(`/banks/${bankId}`, {
    method: 'PUT',
    token,
    body: payload
  })
}

export const deleteBank = (
  token: string,
  bankId: string
): Promise<ApiResult<{ success: boolean }>> => {
  return apiDelete<{ success: boolean }>(`/banks/${bankId}`, { token })
 }

export const downloadBanksCsv = (
  token: string,
  params: { template?: boolean } = {}
): Promise<ApiResult<DownloadPayload>> => {
  const query = params.template ? '?template=1' : ''
  return apiDownload(`/banks/export${query}`, { token })
}

export const uploadBanksSpreadsheet = (
  token: string,
  file: File
): Promise<ApiResult<BulkImportResponse>> => {
  const formData = new FormData()
  formData.append('file', file)
  return apiUpload<BulkImportResponse>('/banks/import', formData, { token })
}
