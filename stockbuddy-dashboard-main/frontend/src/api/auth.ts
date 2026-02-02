import { apiPost, apiRequest, type ApiResult } from './client'
import type { AuthSuccessResponse } from '../types/auth'

type SignupPayload = {
  full_name: string
  email: string
  password: string
  username?: string
}

type LoginPayload = {
  email: string
  password: string
}

export const signup = async (payload: SignupPayload): Promise<ApiResult<AuthSuccessResponse>> => {
  return apiPost<AuthSuccessResponse>('/auth/signup', payload)
}

export const login = async (payload: LoginPayload): Promise<ApiResult<AuthSuccessResponse>> => {
  return apiPost<AuthSuccessResponse>('/auth/login', payload)
}

export const logout = async (token: string): Promise<ApiResult<{ success: boolean }>> => {
  return apiRequest<{ success: boolean }>('/auth/logout', {
    method: 'POST',
    token
  })
}
