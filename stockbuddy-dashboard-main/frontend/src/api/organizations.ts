import { apiDelete, apiGet, apiPost, type ApiResult } from './client'
import type { AuthenticatedUser, SessionOrganization } from '../types/auth'
import type { InvitationWithOrganization, OrganizationInvitation, OrganizationMember } from '../types/organization'

type CreateOrganizationResponse = {
  success: true
  organization: SessionOrganization
  user: AuthenticatedUser
}

type JoinOrganizationResponse = {
  success: true
  organization: SessionOrganization
  user: AuthenticatedUser
}

type MembersResponse = {
  success: true
  members: Array<OrganizationMember & { user: AuthenticatedUser | null }>
}

type InvitationsResponse = {
  success: true
  invitations: OrganizationInvitation[]
}

type CreateInvitationResponse = {
  success: true
  invitation: OrganizationInvitation
}

export const createOrganization = async (
  token: string,
  payload: { name: string }
): Promise<ApiResult<CreateOrganizationResponse>> => {
  return apiPost<CreateOrganizationResponse>('/organizations', payload, { token })
}

export const joinOrganization = async (
  token: string,
  payload: { invite_code: string }
): Promise<ApiResult<JoinOrganizationResponse>> => {
  return apiPost<JoinOrganizationResponse>('/organizations/join', payload, { token })
}

export const getInvitationByCode = async (code: string): Promise<ApiResult<InvitationWithOrganization>> => {
  return apiGet<InvitationWithOrganization>(`/organizations/invitations/${code}`)
}

export const listOrganizationMembers = async (token: string): Promise<ApiResult<MembersResponse>> => {
  return apiGet<MembersResponse>('/organizations/members', { token })
}

export const listOrganizationInvitations = async (token: string): Promise<ApiResult<InvitationsResponse>> => {
  return apiGet<InvitationsResponse>('/organizations/invitations', { token })
}

export const createOrganizationInvitation = async (
  token: string,
  payload: { email: string }
): Promise<ApiResult<CreateInvitationResponse>> => {
  return apiPost<CreateInvitationResponse>('/organizations/invitations', payload, { token })
}

export const cancelOrganizationInvitation = async (
  token: string,
  code: string
): Promise<ApiResult<{ success: boolean }>> => {
  return apiDelete<{ success: boolean }>(`/organizations/invitations/${code}`, { token })
}
