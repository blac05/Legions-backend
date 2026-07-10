import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { financialActionLimiter } from "../middleware/rateLimiters.js";
import { idempotent } from "../middleware/idempotency.js";
import { listDisputes, listMyDisputes, resolveDispute } from "../controllers/disputeController.js";

const router = express.Router();

router.use(requireAuth);
router.get("/mine", listMyDisputes);
router.get("/", requireRole("agent_admin"), listDisputes);
router.post("/:id/resolve", requireRole("agent_admin"), financialActionLimiter, idempotent("resolve_dispute"), resolveDispute);

export default router;