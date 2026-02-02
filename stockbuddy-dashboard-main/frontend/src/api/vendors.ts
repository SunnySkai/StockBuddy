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
  VendorCreatePayload,
  VendorDetailResponse,
  VendorListPayload,
  VendorListResponse,
  VendorListSummary,
  VendorMembershipTransaction,
  VendorRecord,
  VendorTransactionsBundle,
  VendorUpdatePayload
} from '../types/vendors'
import type { BulkImportResponse } from '../types/imports'

const buildQueryString = (params: Record<string, string | undefined>) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return
    query.append(key, value)
  })
  const serialized = query.toString()
  return serialized.length ? `?${serialized}` : ''
}

const ensureSummary = (vendors: VendorRecord[], summary?: { count?: number; total_balance?: number }): VendorListSummary => {
  const total = vendors.reduce((sum, vendor) => sum + (vendor.balance ?? 0), 0)
  return {
    count: typeof summary?.count === 'number' ? summary.count : vendors.length,
    total_balance: typeof summary?.total_balance === 'number' ? summary.total_balance : total
  }
}

export const fetchVendors = (
  token: string,
  params: { search?: string } = {}
): Promise<ApiResult<VendorListResponse>> => {
  const query = buildQueryString({
    search: params.search && params.search.trim().length ? params.search.trim() : undefined
  })
  return apiGet<VendorListResponse>(`/vendors${query}`, { token }).then(result => {
    if (!result.ok) {
      return result
    }
    const payload = result.data.data as VendorListPayload | VendorRecord[]
    let vendors: VendorRecord[]
    let summary: VendorListSummary
    if (Array.isArray(payload)) {
      vendors = payload
      summary = ensureSummary(vendors)
    } else {
      vendors = Array.isArray(payload.vendors) ? payload.vendors : []
      summary = ensureSummary(vendors, payload.summary)
    }
    return {
      ...result,
      data: {
        ...result.data,
        data: {
          vendors,
          summary
        }
      }
    }
  })
}

export const createVendor = (
  token: string,
  payload: VendorCreatePayload
): Promise<ApiResult<VendorDetailResponse>> => {
  return apiPost<VendorDetailResponse>('/vendors', payload, { token })
}

export const updateVendor = (
  token: string,
  vendorId: string,
  payload: VendorUpdatePayload
): Promise<ApiResult<VendorDetailResponse>> => {
  return apiRequest<VendorDetailResponse>(`/vendors/${vendorId}`, {
    method: 'PUT',
    token,
    body: payload
  })
}

export const deleteVendor = (
  token: string,
  vendorId: string
): Promise<ApiResult<{ success: boolean }>> => {
  return apiDelete<{ success: boolean }>(`/vendors/${vendorId}`, { token })
}

export type VendorTransactionsResponse = {
  success: boolean
  data: VendorTransactionsBundle
}

export const fetchVendorTransactions = (
  token: string,
  vendorId: string
): Promise<ApiResult<VendorTransactionsResponse>> => {
  return apiGet<VendorTransactionsResponse>(`/vendors/${vendorId}/transactions`, { token })
}

export const downloadVendorsCsv = (
  token: string,
  params: { template?: boolean } = {}
): Promise<ApiResult<DownloadPayload>> => {
  const query = params.template ? '?template=1' : ''
  return apiDownload(`/vendors/export${query}`, { token })
}

export const uploadVendorsSpreadsheet = (
  token: string,
  file: File
): Promise<ApiResult<BulkImportResponse>> => {
  const formData = new FormData()
  formData.append('file', file)
  return apiUpload<BulkImportResponse>('/vendors/import', formData, { token })
}
