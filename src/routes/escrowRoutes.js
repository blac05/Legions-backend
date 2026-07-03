import express from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  createEscrow, listMyEscrows, getEscrow, agreeToEscrow,
  toggleCondition, releaseMilestone, flagBreach,
} from "../controllers/escrowController.js";

const router = express.Router();

router.use(requireAuth);
router.post("/", createEscrow);
router.get("/", listMyEscrows);
router.get("/:id", getEscrow);
router.post("/:id/agree", agreeToEscrow);
router.patch("/:id/milestones/:milestoneId/conditions/:conditionId", toggleCondition);
router.post("/:id/milestones/:milestoneId/release", releaseMilestone);
router.post("/:id/dispute", flagBreach);

export default router;
