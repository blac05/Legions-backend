import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";
import { generateTwoFASecret, generateQRCode, verifyTwoFAToken, generateBackupCodes } from "../utils/twoFactor.js";
import { sendPasswordResetEmail } from "../utils/email.js";

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

// POST /api/auth/register
export async function register(req, res) {
  const { fullName, email, phone, password } = req.body;
  if (!fullName || !email || !phone || !password) {
    return res.status(400).json({ error: "Full name, email, phone and password are required" });
  }
  if (password.length < 10) {
    return res.status(400).json({ error: "Password must be at least 10 characters" });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    fullName, email, phone, passwordHash,
    role: isAdminEmail(email) ? "agent_admin" : "user",
  });

  const token = signToken(user._id);
  res.status(201).json({ token, user: user.toSafeJSON() });
}

// POST /api/auth/login
export async function login(req, res) {
  const { email, password, twoFAToken } = req.body;
  const user = await User.findOne({ email: (email || "").toLowerCase() }).select("+twoFA.secret");
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const valid = await bcrypt.compare(password || "", user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  if (user.twoFA?.enabled) {
    if (!twoFAToken) {
      return res.status(206).json({ requiresTwoFA: true, message: "Enter your 2FA code to continue" });
    }
    const ok = verifyTwoFAToken(user.twoFA.secret, twoFAToken);
    if (!ok) return res.status(401).json({ error: "Invalid 2FA code" });
  }

  const token = signToken(user._id);
  res.json({ token, user: user.toSafeJSON() });
}

// GET /api/auth/me
export async function me(req, res) {
  res.json({ user: req.user.toSafeJSON() });
}

// POST /api/auth/password/forgot  { email }
// Always responds the same way whether or not the email exists, to avoid leaking
// which emails are registered.
export async function forgotPassword(req, res) {
  const { email } = req.body;
  const genericResponse = { message: "If an account exists for that email, a reset link has been sent." };
  if (!email) return res.json(genericResponse);

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.json(genericResponse);

  const rawToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  await user.save();

  const resetUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;
  await sendPasswordResetEmail(user, resetUrl);

  const response = { ...genericResponse };
  if (process.env.NODE_ENV !== "production") {
    // Convenience for local/dev testing only, since no real email provider is connected yet.
    response.devResetToken = rawToken;
    response.devResetUrl = resetUrl;
  }
  res.json(response);
}

// POST /api/auth/password/reset  { email, token, password }
export async function resetPassword(req, res) {
  const { email, token, password } = req.body;
  if (!email || !token || !password) {
    return res.status(400).json({ error: "Email, token and new password are required" });
  }
  if (password.length < 10) {
    return res.status(400).json({ error: "Password must be at least 10 characters" });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    email: email.toLowerCase(),
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  }).select("+passwordResetTokenHash +passwordResetExpires");

  if (!user) return res.status(400).json({ error: "This reset link is invalid or has expired" });

  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.json({ message: "Password updated. You can now log in with your new password." });
}

// POST /api/auth/kyc  (multipart form: idType, country, document)
// In production, swap this for a call to a licensed KYC/AML provider
// (e.g. Persona, Onfido, Sumsub) and store their inquiry/session id.
export async function submitKyc(req, res) {
  const { idType, country } = req.body;
  const documentUrl = req.file ? `/uploads/${req.file.filename}` : null;

  req.user.idType = idType;
  req.user.country = country;
  req.user.idDocumentUrl = documentUrl;
  req.user.kycStatus = "pending";
  await req.user.save();

  res.json({ message: "Identity documents received. Verification is in progress.", kycStatus: "pending" });
}

// POST /api/auth/kyc/webhook  - called by your KYC provider when a check completes
export async function kycWebhook(req, res) {
  const { userId, status, providerRef } = req.body;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.kycStatus = status === "approved" ? "verified" : "rejected";
  user.kycProviderRef = providerRef;
  await user.save();
  res.json({ received: true });
}

// POST /api/auth/2fa/setup
export async function setupTwoFA(req, res) {
  const secret = generateTwoFASecret(req.user.email);
  const qrCode = await generateQRCode(secret.otpauth_url);

  req.user.twoFA.secret = secret.base32;
  await req.user.save();

  res.json({ qrCode, manualEntryKey: secret.base32 });
}

// POST /api/auth/2fa/verify  { token }
export async function verifyAndEnableTwoFA(req, res) {
  const user = await User.findById(req.user._id).select("+twoFA.secret");
  const { token } = req.body;
  if (!user.twoFA?.secret) return res.status(400).json({ error: "Run 2FA setup first" });

  const ok = verifyTwoFAToken(user.twoFA.secret, token);
  if (!ok) return res.status(400).json({ error: "Invalid code, please try again" });

  const backupCodes = generateBackupCodes();
  user.twoFA.enabled = true;
  user.twoFA.backupCodes = backupCodes;
  await user.save();

  res.json({ message: "Two-factor authentication enabled", backupCodes });
}

// POST /api/auth/2fa/challenge  { token }
export async function challengeTwoFA(req, res) {
  const user = await User.findById(req.user._id).select("+twoFA.secret");
  const { token } = req.body;
  if (!user.twoFA?.enabled) return res.status(400).json({ error: "2FA is not enabled on this account" });

  const ok = verifyTwoFAToken(user.twoFA.secret, token);
  if (!ok) return res.status(401).json({ error: "Invalid 2FA code" });

  res.json({ verified: true });
}