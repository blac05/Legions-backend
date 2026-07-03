import express from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import {
  register, login, me, submitKyc, kycWebhook,
  setupTwoFA, verifyAndEnableTwoFA, challengeTwoFA,
} from "../controllers/authController.js";

const upload = multer({ dest: "uploads/" });
const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, me);

router.post("/kyc", requireAuth, upload.single("document"), submitKyc);
router.post("/kyc/webhook", kycWebhook); // called by your KYC provider, not the frontend

router.post("/2fa/setup", requireAuth, setupTwoFA);
router.post("/2fa/verify", requireAuth, verifyAndEnableTwoFA);
router.post("/2fa/challenge", requireAuth, challengeTwoFA);

export default router;
