interface OrganizationInviteTemplateParams {
  inviteLink: string
  organizationName: string
  inviterName: string
}

export function getOrganizationInviteTemplate(params: OrganizationInviteTemplateParams): string {
  const { inviteLink, organizationName, inviterName } = params
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #0b1b3f; color: #ffffff; padding: 16px; text-align: center; }
          .content { margin-top: 20px; font-size: 16px; line-height: 24px; color: #333333; }
          .button { display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #1f6feb; color: #ffffff; text-decoration: none; border-radius: 4px; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #888888; }
          .link { word-break: break-all; color: #1f6feb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>You're Invited to ${organizationName}</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p><strong>${inviterName}</strong> has invited you to join the <strong>${organizationName}</strong> organization on StockBuddy.</p>
            <p>Click the button below to accept the invitation. If you're not signed in yet, you'll be prompted to log in or create an account with this email address.</p>
            <a href="${inviteLink}" class="button" target="_blank" rel="noopener noreferrer">Accept Invitation</a>
            <p>If the button above doesn't work, copy and paste this link into your browser:</p>
            <p class="link">${inviteLink}</p>
          </div>
          <div class="footer">
            <p>This invitation link will expire in 7 days.</p>
            <p>If you weren't expecting this invitation, feel free to ignore this email.</p>
          </div>
        </div>
      </body>
    </html>
  `
}
