import express from "express";
import { stripeWebhook, bankWebhook, cryptoWebhook } from "../controllers/paymentController.js";

const router = express.Router();

// Note: Stripe webhooks need the raw body - mounted with express.raw() in server.js
router.post("/stripe/webhook", stripeWebhook);
router.post("/bank/webhook", bankWebhook);
router.post("/crypto/webhook", cryptoWebhook);

export default router;
