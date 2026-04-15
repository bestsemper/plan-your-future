import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'Hoos Plan <no-reply@hoosplan.com>';
const BASE_URL = 'https://hoosplan.com';

export async function sendVerificationEmail(email: string, token: string) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Verify your Hoos Plan account',
    html: `
      <p>Thanks for signing up for Hoos Plan.</p>
      <p>Click the link below to verify your email and create your account. This link expires in 15 minutes.</p>
      <p><a href="${BASE_URL}/api/verify-email?token=${token}">Verify my email</a></p>
      <p>If you did not sign up for Hoos Plan, you can ignore this email.</p>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Reset your Hoos Plan password',
    html: `
      <p>We received a request to reset the password for your Hoos Plan account.</p>
      <p>Click the link below to choose a new password. This link expires in 1 hour.</p>
      <p><a href="${BASE_URL}/reset-password?token=${token}">Reset my password</a></p>
      <p>If you did not request a password reset, you can ignore this email.</p>
    `,
  });
}
