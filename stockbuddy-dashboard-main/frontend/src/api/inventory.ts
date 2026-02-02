import {
  apiDelete,
  apiDownload,
  apiGet,
  apiPatch,
  apiPost,
  apiRequest,
  type ApiResult,
  type DownloadPayload
} from './client'
import type {
  InventoryRecord,
  InventoryRecordResponse,
  InventoryRecordsResponse,
  InventoryRecordUpdatePayload,
  InventorySplitPartPayload,
  OrderPayload,
  PurchasePayload,
  SimpleSuccessResponse
} from '../types/inventory'

export const fetchInventoryRecords = (
  token: string,
  params: { gameId?: string; status?: string; recordType?: string; search?: string } = {}
): Promise<ApiResult<InventoryRecordsResponse>> => {
  const query = new URLSearchParams()
  if (params.gameId) query.set('game_id', params.gameId)
  if (params.status) query.set('status', params.status)
  if (params.recordType) query.set('record_type', params.recordType)
  if (params.search) query.set('q', params.search)
  const queryString = query.toString()
  const path = queryString.length ? `/inventory-records?${queryString}` : '/inventory-records'
  return apiGet<InventoryRecordsResponse>(path, { token })
}

export const createPurchaseRecord = (
  token: string,
  payload: PurchasePayload
): Promise<ApiResult<InventoryRecordResponse>> => {
  return apiPost<InventoryRecordResponse>('/inventory-records/purchases', payload, { token })
}

export const createOrderRecord = (
  token: string,
  payload: OrderPayload
): Promise<ApiResult<InventoryRecordResponse>> => {
  return apiPost<InventoryRecordResponse>('/inventory-records/orders', payload, { token })
}

export const updateInventoryRecordApi = (
  token: string,
  recordId: string,
  payload: InventoryRecordUpdatePayload
): Promise<ApiResult<InventoryRecordResponse>> => {
  return apiPatch<InventoryRecordResponse>(`/inventory-records/${recordId}`, payload, { token })
}

export const deleteInventoryRecordApi = (
  token: string,
  recordId: string
): Promise<ApiResult<SimpleSuccessResponse>> => {
  return apiDelete<SimpleSuccessResponse>(`/inventory-records/${recordId}`, { token })
}

export const assignInventoryToOrderApi = (
  token: string,
  params: { inventoryId: string; orderId: string }
): Promise<ApiResult<InventoryRecordResponse>> => {
  return apiPost<InventoryRecordResponse>(
    '/inventory-records/assignments',
    { inventory_id: params.inventoryId, order_id: params.orderId },
    { token }
  )
}

export const unassignSaleApi = (
  token: string,
  saleId: string
): Promise<ApiResult<SimpleSuccessResponse>> => {
  return apiPost<SimpleSuccessResponse>(`/inventory-records/sales/${saleId}/unassign`, {}, { token })
}

export const completeSaleApi = (
  token: string,
  saleId: string
): Promise<ApiResult<SimpleSuccessResponse>> => {
  return apiPost<SimpleSuccessResponse>(`/inventory-records/sales/${saleId}/complete`, {}, { token })
}

export const splitInventoryRecordApi = (
  token: string,
  recordId: string,
  parts: InventorySplitPartPayload[]
): Promise<ApiResult<InventoryRecordsResponse>> => {
  return apiPost<InventoryRecordsResponse>(`/inventory-records/${recordId}/split`, { parts }, { token })
}

export const downloadInventoryCsv = (
  token: string,
  params: { gameId?: string; status?: string; recordType?: string; search?: string; template?: boolean } = {}
): Promise<ApiResult<DownloadPayload>> => {
  const query = new URLSearchParams()
  if (params.gameId) query.set('game_id', params.gameId)
  if (params.status) query.set('status', params.status)
  if (params.recordType) query.set('record_type', params.recordType)
  if (params.search) query.set('q', params.search)
  if (params.template) query.set('template', '1')
  const queryString = query.toString()
  const path = queryString.length ? `/inventory-records/export?${queryString}` : '/inventory-records/export'
  return apiDownload(path, { token })
}
