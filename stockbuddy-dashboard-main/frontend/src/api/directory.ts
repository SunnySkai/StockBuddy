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
  DirectoryCounterpartyPayload,
  DirectoryCounterpartyResponse,
  DirectoryCustomerPayload,
  DirectoryCustomerResponse,
  DirectoryListResponse
} from '../types/directory'
import type { BulkImportResponse } from '../types/imports'

export const fetchDirectoryEntries = (
  token: string
): Promise<ApiResult<DirectoryListResponse>> => {
  return apiGet<DirectoryListResponse>('/directory', { token })
}

export const createDirectoryCustomer = (
  token: string,
  payload: DirectoryCustomerPayload
): Promise<ApiResult<DirectoryCustomerResponse>> => {
  return apiPost<DirectoryCustomerResponse>('/directory/customers', payload, { token })
}

export const updateDirectoryCustomer = (
  token: string,
  customerId: string,
  payload: DirectoryCustomerPayload
): Promise<ApiResult<DirectoryCustomerResponse>> => {
  return apiRequest<DirectoryCustomerResponse>(`/directory/customers/${customerId}`, {
    method: 'PUT',
    token,
    body: payload
  })
}

export const deleteDirectoryCustomer = (
  token: string,
  customerId: string
): Promise<ApiResult<{ success: boolean }>> => {
  return apiDelete<{ success: boolean }>(`/directory/customers/${customerId}`, { token })
}

export const downloadDirectoryCustomersCsv = (
  token: string,
  params: { template?: boolean } = {}
): Promise<ApiResult<DownloadPayload>> => {
  const query = params.template ? '?template=1' : ''
  return apiDownload(`/directory/customers/export${query}`, { token })
}

export const uploadDirectoryCustomersSpreadsheet = (
  token: string,
  file: File
): Promise<ApiResult<BulkImportResponse>> => {
  const formData = new FormData()
  formData.append('file', file)
  return apiUpload<BulkImportResponse>('/directory/customers/import', formData, { token })
}

export const createDirectoryCounterparty = (
  token: string,
  payload: DirectoryCounterpartyPayload
): Promise<ApiResult<DirectoryCounterpartyResponse>> => {
  return apiPost<DirectoryCounterpartyResponse>('/directory/counterparties', payload, { token })
}

export const updateDirectoryCounterparty = (
  token: string,
  counterpartyId: string,
  payload: DirectoryCounterpartyPayload
): Promise<ApiResult<DirectoryCounterpartyResponse>> => {
  return apiRequest<DirectoryCounterpartyResponse>(`/directory/counterparties/${counterpartyId}`, {
    method: 'PUT',
    token,
    body: payload
  })
}

export const deleteDirectoryCounterparty = (
  token: string,
  counterpartyId: string
): Promise<ApiResult<{ success: boolean }>> => {
  return apiDelete<{ success: boolean }>(`/directory/counterparties/${counterpartyId}`, { token })
}

export const downloadDirectoryCounterpartiesCsv = (
  token: string,
  params: { template?: boolean } = {}
): Promise<ApiResult<DownloadPayload>> => {
  const query = params.template ? '?template=1' : ''
  return apiDownload(`/directory/counterparties/export${query}`, { token })
}

export const uploadDirectoryCounterpartiesSpreadsheet = (
  token: string,
  file: File
): Promise<ApiResult<BulkImportResponse>> => {
  const formData = new FormData()
  formData.append('file', file)
  return apiUpload<BulkImportResponse>('/directory/counterparties/import', formData, { token })
}
