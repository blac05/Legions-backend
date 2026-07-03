import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { generateTwoFASecret, generateQRCode, verifyTwoFAToken, generateBackupCodes } from "../utils/twoFactor.js";

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
    role: isAdminEmail(email) ? "agent_admin" : "user", // see ADMIN_EMAILS in .env - grants access to the dispute console
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

  // TODO: call your KYC provider here and let their webhook flip kycStatus to "verified"/"rejected".
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
