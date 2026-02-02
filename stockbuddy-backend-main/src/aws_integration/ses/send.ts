import { getResetPasswordOtpTemplate } from '../../email_templates/password_change'
import { getEmailVerificationOtpTemplate } from '../../email_templates/signup'
import { getOrganizationInviteTemplate } from '../../email_templates/organization_invitation'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const EMAIL_SENDER = 'Ali-ksaad@hotmail.com'

const sesClient = new SESClient({ region: process.env.AWS_REGION })

export async function sendEmail(emailTo: string, subject: string, body: string) {
  const params = {
    Destination: {
      ToAddresses: [emailTo]
    },
    Message: {
      Body: {
        Html: {
          Data: body
        }
      },
      Subject: {
        Data: subject
      },
    },
    Source: `TIXWORLD <${EMAIL_SENDER}>`,
  }
  const command = new SendEmailCommand(params)
  await sesClient.send(command)
}

export async function sendVerificationEmail(emailTo: string, code: number) {
  const htmlBody = getEmailVerificationOtpTemplate(code)
  await sendEmail(emailTo, 'Verify your Email', htmlBody)
}

export async function sendResetPasswordEmail(emailTo: string, code: number) {
  const htmlBody = getResetPasswordOtpTemplate(code)
  await sendEmail(emailTo, 'Password Reset', htmlBody)
}

interface SendOrganizationInviteEmailParams {
  emailTo: string
  organizationName: string
  inviteLink: string
  inviterName: string
}

export async function sendOrganizationInviteEmail(params: SendOrganizationInviteEmailParams) {
  const htmlBody = getOrganizationInviteTemplate({
    inviteLink: params.inviteLink,
    organizationName: params.organizationName,
    inviterName: params.inviterName
  })
  await sendEmail(params.emailTo, `Invitation to join ${params.organizationName}`, htmlBody)
}
