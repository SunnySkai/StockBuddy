export function getEmailVerificationOtpTemplate(otp: number): string {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f8f8; padding: 10px; text-align: center; }
          .content { margin-top: 20px; }
          .footer { margin-top: 20px; text-align: center; font-size: 12px; color: #888; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Email Verification</h1>
          </div>
          <div class="content">
            <p>Dear User,</p>
            <p>Thank you for signing up. Please use the following code to verify your email address:</p>
            <p><strong>${otp}</strong></p>
            <p>If you did not sign up for this account, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>Thank you for choosing our service.</p>
          </div>
        </div>
      </body>
    </html>
  `
}
