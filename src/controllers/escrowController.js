import Escrow from "../models/Escrow.js";
import Dispute from "../models/Dispute.js";
import User from "../models/User.js";
import { calculateFee } from "../utils/fees.js";
import { verifyTwoFAToken } from "../utils/twoFactor.js";
import { createDepositIntent, createPayout } from "./paymentController.js";
import {
  notifyContractInvite, notifyContractActive, notifyMilestoneReleased,
  notifyDisputeFlagged, notifyCancellationRequested, notifyCancelled,
} from "../utils/notify.js";

function generateLegionId() {
  return "LGN-" + Math.floor(10000 + Math.random() * 89999);
}

// POST /api/escrows
export async function createEscrow(req, res) {
  const {
    title, description, role, counterpartyName, counterpartyEmail,
    currency, deadline, milestones, fundingMethod, payoutMethod,
  } = req.body;

  if (!title || !counterpartyEmail || !fundingMethod || !payoutMethod) {
    return res.status(400).json({ error: "Missing required contract fields" });
  }
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return res.status(400).json({ error: "At least one milestone is required" });
  }
  const cleanMilestones = milestones
    .filter((m) => m.title && Number(m.amount) > 0)
    .map((m) => ({
      title: m.title,
      amount: Number(m.amount),
      conditions: (m.conditions || []).filter(Boolean).map((text) => ({ text })),
    }));
  if (cleanMilestones.length === 0) {
    return res.status(400).json({ error: "Each milestone needs a title and an amount greater than 0" });
  }
  if (counterpartyEmail.toLowerCase() === req.user.email.toLowerCase()) {
    return res.status(400).json({ error: "Counterparty must be a different person than the creator" });
  }

  const total = cleanMilestones.reduce((s, m) => s + m.amount, 0);
  const { rate, total: feeTotal } = calculateFee(total);
  const counterpartyUser = await User.findOne({ email: counterpartyEmail.toLowerCase() });

  const isDepositor = role === "depositor";
  const depositor = isDepositor
    ? { user: req.user._id, name: req.user.fullName, email: req.user.email, agreed: true, agreedAt: new Date() }
    : { user: counterpartyUser?._id, name: counterpartyName, email: counterpartyEmail, agreed: false };
  const beneficiary = isDepositor
    ? { user: counterpartyUser?._id, name: counterpartyName, email: counterpartyEmail, agreed: false }
    : { user: req.user._id, name: req.user.fullName, email: req.user.email, agreed: true, agreedAt: new Date() };

  const escrow = await Escrow.create({
    legionId: generateLegionId(),
    title,
    description,
    depositor,
    beneficiary,
    currency: currency || "USD",
    milestones: cleanMilestones,
    agentFeeRate: rate,
    agentFeeAmount: feeTotal,
    fundingMethod,
    payoutMethod,
    deadline: deadline ? new Date(deadline) : undefined,
    status: "pending_agreement",
  });

  await notifyContractInvite(escrow);

  res.status(201).json({ escrow });
}

// GET /api/escrows
export async function listMyEscrows(req, res) {
  const escrows = await Escrow.find({
    $or: [
      { "depositor.user": req.user._id }, { "depositor.email": req.user.email },
      { "beneficiary.user": req.user._id }, { "beneficiary.email": req.user.email },
    ],
  }).sort({ createdAt: -1 });
  res.json({ escrows });
}

// GET /api/escrows/:id
export async function getEscrow(req, res) {
  const escrow = await requireParty(req, res);
  if (!escrow) return;
  res.json({ escrow });
}

async function requireParty(req, res) {
  const escrow = await Escrow.findById(req.params.id);
  if (!escrow) {
    res.status(404).json({ error: "Escrow not found" });
    return null;
  }
  const uid = req.user._id.toString();
  const isParty = escrow.depositor.user?.toString() === uid || escrow.beneficiary.user?.toString() === uid ||
    escrow.depositor.email === req.user.email || escrow.beneficiary.email === req.user.email;
  if (!isParty && req.user.role !== "agent_admin") {
    res.status(403).json({ error: "You are not a party to this contract" });
    return null;
  }
  return escrow;
}

function isPartyUserId(escrow, userId) {
  const uid = userId.toString();
  if (escrow.depositor.user?.toString() === uid) return "depositor";
  if (escrow.beneficiary.user?.toString() === uid) return "beneficiary";
  return null;
}

// POST /api/escrows/:id/agree
export async function agreeToEscrow(req, res) {
  const escrow = await requireParty(req, res);
  if (!escrow) return;
  if (escrow.status === "cancelled") return res.status(400).json({ error: "This contract has been cancelled" });

  const uid = req.user._id.toString();
  if (escrow.depositor.email === req.user.email || escrow.depositor.user?.toString() === uid) {
    escrow.depositor.agreed = true;
    escrow.depositor.agreedAt = new Date();
    escrow.depositor.user = req.user._id;
  } else if (escrow.beneficiary.email === req.user.email || escrow.beneficiary.user?.toString() === uid) {
    escrow.beneficiary.agreed = true;
    escrow.beneficiary.agreedAt = new Date();
    escrow.beneficiary.user = req.user._id;
  }

  let justBecameActive = false;
  if (escrow.depositor.agreed && escrow.beneficiary.agreed && escrow.status === "pending_agreement") {
    escrow.status = "active";
    justBecameActive = true;
    await createDepositIntent(escrow);
  }
  await escrow.save();

  if (justBecameActive) await notifyContractActive(escrow);

  res.json({ escrow });
}

// PATCH /api/escrows/:id/milestones/:milestoneId/conditions/:conditionId
export async function toggleCondition(req, res) {
  const escrow = await requireParty(req, res);
  if (!escrow) return;
  if (escrow.disputed) return res.status(400).json({ error: "Contract is under dispute review; conditions are locked" });
  if (escrow.status === "cancelled") return res.status(400).json({ error: "This contract has been cancelled" });

  const milestone = escrow.milestones.id(req.params.milestoneId);
  if (!milestone) return res.status(404).json({ error: "Milestone not found" });
  if (milestone.released || milestone.refunded) return res.status(400).json({ error: "This milestone has already been settled" });
  const condition = milestone.conditions.id(req.params.conditionId);
  if (!condition) return res.status(404).json({ error: "Condition not found" });

  condition.met = !condition.met;
  condition.metAt = condition.met ? new Date() : null;
  condition.metBy = condition.met ? req.user._id : null;

  await escrow.save();
  res.json({ escrow });
}

// POST /api/escrows/:id/milestones/:milestoneId/release  { twoFAToken }
export async function releaseMilestone(req, res) {
  const escrow = await requireParty(req, res);
  if (!escrow) return;
  if (escrow.disputed) return res.status(400).json({ error: "Funds are locked while this contract is under dispute review" });
  if (escrow.status === "cancelled") return res.status(400).json({ error: "This contract has been cancelled" });

  const milestone = escrow.milestones.id(req.params.milestoneId);
  if (!milestone) return res.status(404).json({ error: "Milestone not found" });
  if (milestone.released) return res.status(400).json({ error: "This milestone has already been released" });
  if (milestone.refunded) return res.status(400).json({ error: "This milestone was already resolved as a refund and can't be released" });

  const allMet = milestone.conditions.length > 0 && milestone.conditions.every((c) => c.met);
  if (!allMet) return res.status(400).json({ error: "All conditions for this milestone must be met before release" });

  const user = await User.findById(req.user._id).select("+twoFA.secret");
  if (user.twoFA?.enabled) {
    const { twoFAToken } = req.body;
    if (!twoFAToken || !verifyTwoFAToken(user.twoFA.secret, twoFAToken)) {
      return res.status(401).json({ error: "A valid 2FA code is required to release funds" });
    }
  }

  await createPayout(escrow, milestone);
  milestone.released = true;
  milestone.releasedAt = new Date();

  if (escrow.milestones.every((m) => m.released)) {
    escrow.status = "completed";
  }
  await escrow.save();

  await notifyMilestoneReleased(escrow, milestone);

  res.json({ escrow });
}

// POST /api/escrows/:id/dispute  { reason, milestoneId? }
export async function flagBreach(req, res) {
  const escrow = await requireParty(req, res);
  if (!escrow) return;
  if (escrow.status === "cancelled") return res.status(400).json({ error: "This contract has been cancelled" });
  const { reason, milestoneId } = req.body;
  if (!reason) return res.status(400).json({ error: "Please describe the breach" });

  escrow.disputed = true;
  escrow.disputeReason = reason;
  escrow.disputeRaisedBy = req.user._id;
  escrow.status = "disputed";
  await escrow.save();

  await Dispute.create({
    escrow: escrow._id,
    milestoneId: milestoneId || undefined,
    raisedBy: req.user._id,
    reason,
    status: "open",
  });

  await notifyDisputeFlagged(escrow);

  res.json({ escrow });
}

// POST /api/escrows/:id/cancel
export async function requestCancellation(req, res) {
  const escrow = await requireParty(req, res);
  if (!escrow) return;

  if (escrow.fundedAt) {
    return res.status(400).json({ error: "This contract has already been funded and can't be cancelled directly — open a dispute instead" });
  }
  if (!["pending_agreement", "active"].includes(escrow.status)) {
    return res.status(400).json({ error: "This contract can no longer be cancelled" });
  }

  const partyRole = isPartyUserId(escrow, req.user._id);
  if (!partyRole) return res.status(403).json({ error: "You are not a party to this contract" });

  if (escrow.status === "pending_agreement") {
    escrow.status = "cancelled";
    escrow.cancelledAt = new Date();
    await escrow.save();
    await notifyCancelled(escrow);
    return res.json({ escrow, message: "Contract cancelled." });
  }

  if (!escrow.cancellationRequestedBy) {
    escrow.cancellationRequestedBy = req.user._id;
    escrow.cancellationRequestedAt = new Date();
    await escrow.save();
    await notifyCancellationRequested(escrow, partyRole);
    return res.json({ escrow, message: "Cancellation requested. Waiting for the other party to confirm." });
  }

  if (escrow.cancellationRequestedBy.toString() === req.user._id.toString()) {
    return res.status(400).json({ error: "You've already requested cancellation — waiting on the other party to confirm." });
  }

  escrow.status = "cancelled";
  escrow.cancelledAt = new Date();
  await escrow.save();
  await notifyCancelled(escrow);
  res.json({ escrow, message: "Contract cancelled by mutual agreement." });
}

// POST /api/escrows/:id/cancel/withdraw
export async function withdrawCancellation(req, res) {
  const escrow = await requireParty(req, res);
  if (!escrow) return;

  if (!escrow.cancellationRequestedBy) {
    return res.status(400).json({ error: "There's no pending cancellation request on this contract" });
  }

  escrow.cancellationRequestedBy = undefined;
  escrow.cancellationRequestedAt = undefined;
  await escrow.save();
  res.json({ escrow });
}