/**
 * Email sending is stubbed - swap this for a real provider (SendGrid, Postmark,
 * AWS SES) before going live. In the meantime, in non-production environments
 * the reset link is also returned directly in the API response so you can test
 * the flow without an email provider connected.
 */
export async function sendPasswordResetEmail(user, resetUrl) {
  // TODO: replace with a real provider, e.g.:
  // await sgMail.send({ to: user.email, from: "no-reply@legion.app", templateId: "...", dynamicTemplateData: { resetUrl } });
  console.log(`[legion] (stub email) Password reset for ${user.email}: ${resetUrl}`);
}

export async function sendContractNotification(user, subject, message) {
  // TODO: wire to your email/SMS/Telegram provider of choice for stage-change and
  // deadline-reminder notifications.
  console.log(`[legion] (stub notification) To ${user.email} — ${subject}: ${message}`);
}