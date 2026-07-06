import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import {
  register, login, me, submitKyc, kycWebhook,
  setupTwoFA, verifyAndEnableTwoFA, challengeTwoFA, regenerateBackupCodes,
  forgotPassword, resetPassword, verifyEmail, resendVerificationEmail,
} from "../controllers/authController.js";

// Files are held in memory only, then streamed straight to Cloudinary
// (src/utils/cloudinary.js) - never written to local disk, which is ephemeral
// on Render and similar platforms.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    cb(allowed.includes(file.mimetype) ? null : new Error("Only JPG, PNG, WEBP or PDF files are allowed"), allowed.includes(file.mimetype));
  },
});

const router = express.Router();

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/register", credentialLimiter, register);
router.post("/login", credentialLimiter, login);
router.post("/password/forgot", credentialLimiter, forgotPassword);
router.post("/password/reset", credentialLimiter, resetPassword);
router.post("/email/verify", credentialLimiter, verifyEmail);

router.get("/me", requireAuth, me);
router.post("/email/resend", requireAuth, credentialLimiter, resendVerificationEmail);

router.post("/kyc", requireAuth, upload.single("document"), submitKyc);
router.post("/kyc/webhook", kycWebhook);

router.post("/2fa/setup", requireAuth, setupTwoFA);
router.post("/2fa/verify", requireAuth, verifyAndEnableTwoFA);
router.post("/2fa/challenge", requireAuth, challengeTwoFA);
router.post("/2fa/backup-codes/regenerate", requireAuth, regenerateBackupCodes);

export default router;