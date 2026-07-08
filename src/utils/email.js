/**
 * Email sending is stubbed - replace these with a real provider
 * (SendGrid, Postmark, AWS SES, Resend, Nodemailer, etc.)
 * before going live.
 */

export async function sendPasswordResetEmail(user, resetUrl) {
  console.log(
    `[legion] (stub email) Password reset for ${user.email}: ${resetUrl}`
  );
}

export async function sendVerificationEmail(user, verificationUrl) {
  console.log(
    `[legion] (stub email) Email verification for ${user.email}: ${verificationUrl}`
  );
}

export async function sendContractNotification(user, subject, message) {
  console.log(
    `[legion] (stub notification) To ${user.email} — ${subject}: ${message}`
  );
}