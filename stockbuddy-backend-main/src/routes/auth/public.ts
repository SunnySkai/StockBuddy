import express, { Response } from 'express'
import { optionalStringParam, requireIntParam, requireLoggedInUser, requireStringParam } from '../../decorators/require_param'
import { validateAndNormalizeEmail } from '../../helpers/validate'
import { User } from '../../models/user'
import { hashPassword, verifyPassword } from '../../auth/password'
import { encodeAuthToken } from '../../auth/token'
import { Request, AuthenticatedRequest } from '../../models/request'
import { EmailTemplateType } from '../../models/email_template_type'
import { sendResetPasswordEmail, sendVerificationEmail } from '../../aws_integration/ses/send'
import { OTP } from '../../models/otp'
import { toPublicUser } from '../../helpers/user'
import {
  isUsernameTaken as isUsernameTakenFn,
  userHasAccount as userHasAccountFn,
  createUser,
  getUserByEmail,
  markTokenAsBlacklisted,
  updateUserField
} from '../../daos/user'
import { deleteOtp, getOtpByEmail, insertOtpCode } from '../../daos/otp'

const route = express.Router()

route.post('/signup',
  requireStringParam('full_name', (x: string) => x.length > 0),
  optionalStringParam('username', (x: string) => x.length > 0),
  requireStringParam('email', (x: string) => x.length > 0),
  requireStringParam('password', (x: string) => x.length > 0),
  async(req: Request, res: Response) : Promise <void> => {
    const tenant = req.tenant ?? ''
    let email = req.body.email
    const { full_name, password } = req.body
    const rawUsername: string | undefined = typeof req.body.username === 'string' ? req.body.username.trim() : undefined
    let username: string | null = null

    try {
      email = validateAndNormalizeEmail(email)
    } catch(error) {
      res.status(400).json({ success: false, message: (error as Error).message })
      return
    }

    if (rawUsername) {
      const normalizedUsername = rawUsername.toLowerCase()
      const isUsernameTaken: boolean = await isUsernameTakenFn(tenant, normalizedUsername)
      if (isUsernameTaken) {
        res.status(409).json({ success: false, message: 'The username you have chosen is already in use' })
        return
      }
      username = normalizedUsername
    }

    let userHasAccount: boolean = await userHasAccountFn(tenant, email)
    if (userHasAccount) {
      res.status(409).json({ success: false, message: 'The email you entered is already associated with an existing account' })
      return
    }

    const password_hash = hashPassword(password)
    const user: User = await createUser(tenant, email, username, password_hash, full_name)
    const authToken = await encodeAuthToken(user.id)
    res.json({ success: true, user: toPublicUser(user), auth_token: authToken })
  }
)

route.post('/login',
  requireStringParam('email', (x: string) => x.length > 0),
  requireStringParam('password', (x: string) => x.length > 0),
  async(req: Request, res: Response) : Promise <void> => {
    const tenant = req.tenant ?? ''
    let email = req.body.email
    const password = req.body.password
    try {
      email = validateAndNormalizeEmail(email)
    } catch(error) {
      res.status(400).json({ success: false, message: (error as Error).message })
      return
    }

    const user: User | null = await getUserByEmail(tenant, email)
    if (user == null) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    if (!verifyPassword(password, user.password_hash)) {
      res.status(400).json({ success: false, message: 'Incorrect password' })
      return
    }

    const authToken = await encodeAuthToken(user.id)

    res.json({ success: true, user: toPublicUser(user), auth_token: authToken })
  }
)

route.post('/verify_email',
  requireStringParam('email', (x: string) => x.length > 0),
  async(req: Request, res: Response) : Promise <void> => {
    const tenant = req.tenant ?? ''
    let email = req.body.email
    try {
      email = validateAndNormalizeEmail(email);
    } catch (error) {
      res.status(400).json({ success: false, message: (error as Error).message })
      return
    }

    const userHasAccount = await userHasAccountFn(tenant, email)
    if (userHasAccount) {
      res.json({ success: true, has_account: true })
      return
    }
    res.json({ success: true, has_account: false })
  }
);

route.post('/verify_username',
  requireStringParam('username', (x: string) => x.length > 0),
  async(req: Request, res: Response) : Promise <void> => {
    const tenant = req.tenant ?? ''
    const username = req.body.username.toLowerCase()

    const isUsernameTaken = await isUsernameTakenFn(tenant, username)
    if (isUsernameTaken) {
      res.status(400).json({ success: false, message: 'The username you have chosen is already in use' })
      return
    }
    res.json({ success: true })
  }
)

route.post('/logout',
  requireLoggedInUser(),
  async(req: Request, res: Response) : Promise <void> => {
  const tenant = req.tenant ?? ''
  const authRequest = (req as AuthenticatedRequest)
  const authHeader = authRequest.headers['authorization']
  const token = authHeader.split(' ')[1]

  await Promise.all([
    markTokenAsBlacklisted(tenant, token),
    // removeUserFCMToken(tenant, authRequest.userId)
  ])

  res.json({ success: true })
})

route.post('/send_otp',
  requireStringParam('email', (x: string) => x.length > 0),
  requireIntParam('template_type', (x: string) => Object.values(EmailTemplateType).includes(x)),
  async(req: Request, res: Response) : Promise <void> => {
    const tenant = req.tenant ?? ''
    let email = req.body.email
    const templateType = Number(req.body.template_type)

    try {
      email = validateAndNormalizeEmail(email)
    } catch (error) {
      res.status(400).json({ success: false, message: (error as Error).message })
      return
    }

    if (templateType === EmailTemplateType.PASSWORD_CHANGE) {
      const userHasAccount = await userHasAccountFn(tenant, email)
      if (!userHasAccount) {
        res.status(404).json({ success: false, message: 'The user associated with this email does not exist in our system' })
        return
      }
    }

    await deleteOtp(tenant, email)
    const otpCode = Math.floor(1000 + Math.random() * 9000)

    if (templateType === EmailTemplateType.SIGNUP) {
      await sendVerificationEmail(email, otpCode)
    } else if (templateType === EmailTemplateType.PASSWORD_CHANGE) {
      await sendResetPasswordEmail(email, otpCode)
    } else {
      throw new Error(`Unhandled template type: ${templateType}`)
    }

    const expiryDate = new Date()
    expiryDate.setUTCMinutes(expiryDate.getUTCMinutes() + 2)
    await insertOtpCode(tenant, otpCode, email, expiryDate)

    res.json({ success: true })
  }
)

route.post('/verify_otp',
  requireStringParam('email'),
  requireIntParam('otp'),
  async(req: Request, res: Response) : Promise<void> => {
    const tenant = req.tenant ?? ''
    let email = req.body.email
    const code = parseInt(req.body.otp)

    try {
      email = validateAndNormalizeEmail(email)
    } catch (error){
      res.status(400).json({ success: false, message: (error as Error).message })
    }

    const otpCode: OTP | null = await getOtpByEmail(tenant, email)
    if (otpCode == null) {
      res.status(404).json({ success: false, message: 'OTP not found' })
      return
    }

    const currentDate = new Date(Date.now())
    const expiryDate: Date = new Date(otpCode.expiry_date)
    if (expiryDate < currentDate) {
      res.status(400).json({ success: false, message: 'OTP expired' })
      return
    }

    if (code !== otpCode.code) {
      res.status(400).json({ success: false, message: 'OTP expired' })
      return
    }
    res.json({ success: true })
  }
)

route.post('/reset_password',
  requireStringParam('email'),
  requireStringParam('password'),
  async(req: Request, res: Response) : Promise<void> => {
    const tenant = req.tenant ?? ''
    let email = req.body.email
    const password = req.body.password

    try {
      email = validateAndNormalizeEmail(email)
    } catch (error){
      res.status(400).json({ success: false, message: (error as Error).message })
    }

    const otpCode: OTP | null = await getOtpByEmail(tenant, email)
    if (otpCode == null) {
      res.status(404).json({ success: false, message: 'Access denied' })
      return
    }

    const user: User | null = await getUserByEmail(tenant, email)
    if (user == null) {
      res.status(404).json({ success: false, message: 'The user associated with this email does not exist in our system' })
      return
    }

    await deleteOtp(tenant, email)

    const passwordHash = hashPassword(password)
    await updateUserField(tenant, user.id, 'password_hash', passwordHash)

    res.json({ success: true })
  }
)

export = route
