export function getResetPasswordOtpTemplate(otp: number): string {
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
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Dear User,</p>
            <p>We received a request to reset your password. Please use the following code to reset your password:</p>
            <p><strong>${otp}</strong></p>
            <p>If you did not request a password reset, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>Thank you for using our service.</p>
          </div>
        </div>
      </body>
    </html>
  `
}
