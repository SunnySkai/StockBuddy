import { apiGet, type ApiResult } from './client'
import type { MeSuccessResponse } from '../types/auth'

export const getMyProfile = async (token: string): Promise<ApiResult<MeSuccessResponse>> => {
  return apiGet<MeSuccessResponse>('/users/me', { token })
}
