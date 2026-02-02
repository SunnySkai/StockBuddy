import express, { Response } from 'express'
import { requireLoggedInUser, requireStringParam } from '../../decorators/require_param'
import { AuthenticatedRequest, Request } from '../../models/request'
import {
  addUserToOrganization,
  createOrganization,
  createOrganizationInvitation,
  findActiveInvitationByEmail,
  getInvitationByCode,
  getOrganizationById,
  isConditionalCheckFailed,
  listOrganizationInvitations,
  listOrganizationMembers,
  markInvitationAccepted,
  markInvitationCancelled
} from '../../daos/organization'
import { OrganizationMemberRole } from '../../models/organization'
import { OrganizationInvitation, OrganizationInvitationStatus } from '../../models/organization_invitation'
import { validateAndNormalizeEmail } from '../../helpers/validate'
import { batchGetUsersByIds, getUserByEmail, getUserById } from '../../daos/user'
import { User } from '../../models/user'
import { sendOrganizationInviteEmail } from '../../aws_integration/ses/send'
import { toPublicUser, toPublicUserOrNull } from '../../helpers/user'

const route = express.Router()

const ensureOrganizationContext = (request: AuthenticatedRequest, res: Response): string | null => {
  const user = request.user
  if (!user || !user.organization_id) {
    res.status(403).json({ success: false, message: 'Organization membership required' })
    return null
  }
  return user.organization_id
}

const buildInvitationLink = (code: string): string => {
  const baseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:5173'
  const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  return `${trimmedBase}/join/${code}`
}

const assertNoOrganizationMembership = (user: User | null | undefined): boolean => {
  return !user?.organization_id
}

const isInvitationExpired = (invitation: OrganizationInvitation): boolean => {
  if (!invitation.expires_at) {
    return false
  }
  return new Date(invitation.expires_at) <= new Date()
}

route.post('/',
  requireLoggedInUser(),
  requireStringParam('name', (value: string) => !!value.trim().length),
  async (req: Request, res: Response): Promise<void> => {
    const tenant = req.tenant ?? ''
    const authRequest = req as AuthenticatedRequest
    const user = authRequest.user

    if (!user) {
      res.status(401).json({ success: false, message: 'Access denied.' })
      return
    }

    if (user.organization_id) {
      res.status(400).json({ success: false, message: 'You already belong to an organization' })
      return
    }

    const name = (req.body.name as string).trim()

    try {
      const organization = await createOrganization(tenant, { name, ownerUserId: user.id })
      const refreshedUser = await getUserById(tenant, user.id)
      if (!refreshedUser) {
        throw new Error('New organization owner user not found after creation')
      }
      res.json({
        success: true,
        organization,
        user: toPublicUser(refreshedUser)
      })
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        res.status(400).json({ success: false, message: 'Unable to create organization at this time' })
        return
      }
      throw error
    }
  }
)

const acceptInvitation = async (req: Request, res: Response): Promise<void> => {
  const tenant = req.tenant ?? ''
  const authRequest = req as AuthenticatedRequest
  const user = authRequest.user

  if (!user) {
    res.status(401).json({ success: false, message: 'Access denied.' })
    return
  }

  if (!assertNoOrganizationMembership(user)) {
    res.status(400).json({ success: false, message: 'You are already part of an organization' })
    return
  }

  const inviteCode = (req.body.invite_code as string).trim()
  const invitation = await getInvitationByCode(tenant, inviteCode)

  if (!invitation) {
    res.status(404).json({ success: false, message: 'Invitation not found' })
    return
  }

  if (invitation.status !== OrganizationInvitationStatus.PENDING) {
    res.status(400).json({ success: false, message: 'This invitation is no longer active' })
    return
  }

  if (isInvitationExpired(invitation)) {
    res.status(400).json({ success: false, message: 'This invitation has expired' })
    return
  }

  if (invitation.email && invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    res.status(403).json({ success: false, message: 'This invitation was not issued for your account' })
    return
  }

  const organization = await getOrganizationById(tenant, invitation.org_id)
  if (!organization) {
    res.status(404).json({ success: false, message: 'Organization not found' })
    return
  }

  try {
    await addUserToOrganization(tenant, organization.id, user.id, {
      role: OrganizationMemberRole.MEMBER,
      invitedByUserId: invitation.invited_by_user_id
    })
    await markInvitationAccepted(tenant, invitation.code, user.id)
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      res.status(400).json({ success: false, message: 'Unable to accept invitation' })
      return
    }
    throw error
  }

  const refreshedUser = await getUserById(tenant, user.id)
  if (!refreshedUser) {
    throw new Error('User not found after accepting invitation')
  }

  res.json({
    success: true,
    organization,
    user: toPublicUser(refreshedUser)
  })
}

route.post('/join',
  requireLoggedInUser(),
  requireStringParam('invite_code', (value: string) => !!value.trim().length),
  async (req: Request, res: Response): Promise<void> => acceptInvitation(req, res)
)

route.post('/invitations/accept',
  requireLoggedInUser(),
  requireStringParam('invite_code', (value: string) => !!value.trim().length),
  async (req: Request, res: Response): Promise<void> => acceptInvitation(req, res)
)

route.get('/invitations/:code',
  async (req: Request, res: Response): Promise<void> => {
    const tenant = req.tenant ?? ''
    const { code } = req.params

    const invitation = await getInvitationByCode(tenant, code)
    if (!invitation) {
      res.status(404).json({ success: false, message: 'Invitation not found' })
      return
    }

    const organization = await getOrganizationById(tenant, invitation.org_id)

    res.json({
      success: true,
      invitation: {
        code: invitation.code,
        status: invitation.status,
        email: invitation.email,
        organization: organization ? { id: organization.id, name: organization.name } : null,
        expires_at: invitation.expires_at,
        invited_by_user_id: invitation.invited_by_user_id
      }
    })
  }
)

route.get('/members',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const tenant = req.tenant ?? ''
    const authRequest = req as AuthenticatedRequest
    const organizationId = ensureOrganizationContext(authRequest, res)

    if (!organizationId) return

    const memberships = await listOrganizationMembers(tenant, organizationId)
    const usersMap = await batchGetUsersByIds(tenant, memberships.map(member => member.user_id))

    const members = memberships.map(member => ({
      ...member,
      user: toPublicUserOrNull(usersMap[member.user_id])
    }))

    res.json({ success: true, members })
  }
)

route.get('/invitations',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const tenant = req.tenant ?? ''
    const authRequest = req as AuthenticatedRequest
    const organizationId = ensureOrganizationContext(authRequest, res)

    if (!organizationId) return

    const invitations = await listOrganizationInvitations(tenant, organizationId)
    res.json({ success: true, invitations })
  }
)

route.post('/invitations',
  requireLoggedInUser(),
  requireStringParam('email', (value: string) => !!value.trim().length),
  async (req: Request, res: Response): Promise<void> => {
    const tenant = req.tenant ?? ''
    const authRequest = req as AuthenticatedRequest
    const user = authRequest.user

    if (!user) {
      res.status(401).json({ success: false, message: 'Access denied.' })
      return
    }

    const organizationId = ensureOrganizationContext(authRequest, res)
    if (!organizationId) return

    let email: string
    try {
      email = validateAndNormalizeEmail(req.body.email)
    } catch (error) {
      res.status(400).json({ success: false, message: (error as Error).message })
      return
    }

    if (email.toLowerCase() === user.email.toLowerCase()) {
      res.status(400).json({ success: false, message: 'You cannot invite yourself' })
      return
    }

    const existingUser = await getUserByEmail(tenant, email)
    if (existingUser?.organization_id === organizationId) {
      res.status(400).json({ success: false, message: 'This user is already part of your organization' })
      return
    }

    const activeInvite = await findActiveInvitationByEmail(tenant, organizationId, email)
    if (activeInvite) {
      res.status(409).json({ success: false, message: 'An active invitation already exists for this email' })
      return
    }

    const organization = await getOrganizationById(tenant, organizationId)
    if (!organization) {
      res.status(404).json({ success: false, message: 'Organization not found' })
      return
    }

    const invitation = await createOrganizationInvitation(tenant, {
      orgId: organizationId,
      email,
      invitedByUserId: user.id
    })

    const inviteLink = buildInvitationLink(invitation.code)
      await sendOrganizationInviteEmail({
        emailTo: email,
        organizationName: organization.name,
        inviteLink,
        inviterName: user.full_name
      })

    res.json({ success: true, invitation })
  }
)

route.delete('/invitations/:code',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const tenant = req.tenant ?? ''
    const authRequest = req as AuthenticatedRequest
    const user = authRequest.user
    const organizationId = ensureOrganizationContext(authRequest, res)

    if (!user || !organizationId) return

    const invitation = await getInvitationByCode(tenant, req.params.code)
    if (!invitation || invitation.org_id !== organizationId) {
      res.status(404).json({ success: false, message: 'Invitation not found' })
      return
    }

    if (invitation.status !== OrganizationInvitationStatus.PENDING) {
      res.status(400).json({ success: false, message: 'Only pending invitations can be cancelled' })
      return
    }

    try {
      await markInvitationCancelled(tenant, invitation.code, user.id)
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        res.status(400).json({ success: false, message: 'Invitation is no longer cancellable' })
        return
      }
      throw error
    }

    res.json({ success: true })
  }
)

export = route
