import express from "express";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth.js";
import { financialActionLimiter } from "../middleware/rateLimiters.js";
import { idempotent } from "../middleware/idempotency.js";
import {
  createEscrow, listMyEscrows, getEscrow, agreeToEscrow,
  toggleCondition, releaseMilestone, flagBreach,
  requestCancellation, withdrawCancellation,
} from "../controllers/escrowController.js";

const router = express.Router();

router.use(requireAuth);
router.post("/", requireVerifiedEmail, createEscrow);
router.get("/", listMyEscrows);
router.get("/:id", getEscrow);
router.post("/:id/agree", requireVerifiedEmail, agreeToEscrow);
router.patch("/:id/milestones/:milestoneId/conditions/:conditionId", toggleCondition);
router.post("/:id/milestones/:milestoneId/release", financialActionLimiter, idempotent("release_milestone"), releaseMilestone);
router.post("/:id/dispute", flagBreach);
router.post("/:id/cancel", financialActionLimiter, requestCancellation);
router.post("/:id/cancel/withdraw", withdrawCancellation);

export default router;