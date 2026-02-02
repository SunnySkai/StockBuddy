import express, { Response } from 'express'
import { requireJsonParam, requireLoggedInUser, requireStringParam } from '../../decorators/require_param'
import { AuthenticatedRequest, Request } from '../../models/request'
import { getUserById, listUsers, updateUserField } from '../../daos/user'
import { User } from '../../models/user'
import { hashPassword } from '../../auth/password'
import { getOrganizationById } from '../../daos/organization'
import { Organization } from '../../models/organization'
import { toPublicUser, PublicUser } from '../../helpers/user'

const ALLOWED_PROFILE_EDIT_FIELDS = ['username', 'full_name', 'profile_pic_url', 'phone_number']
const OPTIONAL_PROFILE_FIELDS = ['phone_number']

const route = express.Router()

const buildUserProfileResponse = async (
  tenant: string,
  user: User
): Promise<{ user: PublicUser; organization: Organization | null; has_organization: boolean }> => {
  const organization = user.organization_id
    ? await getOrganizationById(tenant, user.organization_id)
    : null
  const publicUser = toPublicUser(user)
  if (!publicUser) {
    throw new Error('Unable to load user profile')
  }

  return {
    user: publicUser,
    organization,
    has_organization: !!organization
  }
}

const handleGetMyProfile = async (req: Request, res: Response): Promise<void> => {
  const tenant = req.tenant ?? ''
  const request = req as AuthenticatedRequest
  const userId = request.userId

  const user: User | null = request.user ?? await getUserById(tenant, userId)
  if (user == null) {
    res.status(404).json({ success: false, message: 'User not found' })
    return
  }

  const payload = await buildUserProfileResponse(tenant, user)
  res.json({ success: true, ...payload })
}

route.post('/get_my_user',
  requireLoggedInUser(),
  async(req: Request, res: Response): Promise<void> => handleGetMyProfile(req, res)
)

route.get('/me',
  requireLoggedInUser(),
  async(req: Request, res: Response): Promise<void> => handleGetMyProfile(req, res)
)

route.post('/get_all',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const tenant = req.tenant ?? ''
    const rawLimit = req.body?.limit
    const limit = typeof rawLimit === 'number'
      ? rawLimit
      : typeof rawLimit === 'string' && rawLimit.trim().length
        ? parseInt(rawLimit, 10)
        : undefined

    const { items, lastKey } = await listUsers(tenant, {
      limit: Number.isFinite(limit) ? limit : undefined,
      lastKey: req.body?.lastKey
    })

    const users = items.map((user) => toPublicUser(user))

    res.json({ success: true, users, lastKey })
  }
)

route.post('/update_profile',
  requireLoggedInUser(),
  requireStringParam('field_name'),
  requireStringParam('field_value'),
  async(req: Request, res: Response) : Promise<void> => {
    const tenant = req.tenant ?? ''
    const request = (req as AuthenticatedRequest)
    const userId = request.userId
    const { field_name: fieldName, field_value: fieldValue } = req.body

    if (!ALLOWED_PROFILE_EDIT_FIELDS.includes(fieldName)) {
      res.status(400).json({ success: false, message: 'Field not allowed for update' })
      return
    }

    if (!fieldValue && !OPTIONAL_PROFILE_FIELDS.includes(fieldName)) {
      res.status(400).json({ success: false, message: 'Please enter field value' })
      return
    }

    await updateUserField(tenant, userId, fieldName, fieldValue)

    res.json({ success: true })
  }
)

route.post('/update_profile_multiple_fields',
  requireLoggedInUser(),
  requireJsonParam('fields'),
  async(req: Request, res: Response) : Promise<void> => {
    const tenant = req.tenant ?? ''
    const request = (req as AuthenticatedRequest)
    const userId = request.userId
    const fields = JSON.parse(req.body.fields)

    const invalidFields = Object.keys(fields).filter(field => !ALLOWED_PROFILE_EDIT_FIELDS.includes(field))
    if (invalidFields.length > 0) {
      res.status(400).json({ success: false, message: `Fields not allowed for update: ${invalidFields.join(', ')}` })
      return
    }

    const emptyFields = Object.entries(fields).filter(([fieldName, fieldValue]) => 
      !fieldValue && !OPTIONAL_PROFILE_FIELDS.includes(fieldName)
    )
    if (emptyFields.length > 0) {
      const emptyFieldNames = emptyFields.map(([fieldName]) => fieldName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
      res.status(400).json({ success: false, message: `Please enter: ${emptyFieldNames.join(', ')}` })
      return
    }

    await Promise.all(
      Object.entries(fields).map(([fieldName, fieldValue]) => 
        updateUserField(tenant, userId, fieldName, fieldValue)
      )
    )

    res.json({ success: true })
  }
)

route.post('/change_password',
  requireLoggedInUser(),
  requireStringParam('password'),
  async(req: Request, res: Response) : Promise<void> => {
    const tenant = req.tenant ?? ''
    const request = (req as AuthenticatedRequest)
    const userId = request.userId

    const passwordHash = hashPassword(request.body.password)
    await updateUserField(tenant, userId, 'password_hash', passwordHash)

    res.json({ success: true })
  }
)


export = route

