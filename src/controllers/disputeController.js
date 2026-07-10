import Dispute from "../models/Dispute.js";
import Escrow from "../models/Escrow.js";
import { createPayout, createRefund, createSplitPayout } from "./paymentController.js";
import { notifyDisputeResolved } from "../utils/notify.js";

// GET /api/disputes  (agent_admin only)
export async function listDisputes(req, res) {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const disputes = await Dispute.find(filter).populate("escrow").sort({ createdAt: -1 });
  res.json({ disputes });
}

// GET /api/disputes/mine
export async function listMyDisputes(req, res) {
  const myEscrows = await Escrow.find({
    $or: [{ "depositor.user": req.user._id }, { "beneficiary.user": req.user._id }],
  }).select("_id");
  const disputes = await Dispute.find({ escrow: { $in: myEscrows.map((e) => e._id) } })
    .populate("escrow")
    .sort({ createdAt: -1 });
  res.json({ disputes });
}

function settleFinalStatus(escrow) {
  const allSettled = escrow.milestones.every((m) => m.released || m.refunded);
  if (!allSettled) {
    escrow.status = "active";
    return;
  }
  const anyReleased = escrow.milestones.some((m) => m.released);
  const anyRefunded = escrow.milestones.some((m) => m.refunded);
  escrow.status = anyReleased || !anyRefunded ? "completed" : "refunded";
}

// POST /api/disputes/:id/resolve  (agent_admin only)
// body: { resolution: "release_to_beneficiary" | "refund_depositor" | "split", notes, splitPercent }
export async function resolveDispute(req, res) {
  const { resolution, notes, splitPercent } = req.body;
  if (!["release_to_beneficiary", "refund_depositor", "split"].includes(resolution)) {
    return res.status(400).json({ error: "Invalid resolution type" });
  }
  if (resolution === "split") {
    const pct = Number(splitPercent);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: "splitPercent must be a number between 0 and 100" });
    }
  }

  const dispute = await Dispute.findById(req.params.id).populate("escrow");
  if (!dispute) return res.status(404).json({ error: "Dispute not found" });
  const escrow = dispute.escrow;

  dispute.status = "resolved";
  dispute.resolution = resolution;
  dispute.resolutionNotes = notes;
  dispute.resolvedBy = req.user._id;
  dispute.resolvedAt = new Date();
  await dispute.save();

  escrow.disputed = false;
  const unsettled = escrow.milestones.filter((m) => !m.released && !m.refunded);

  if (resolution === "release_to_beneficiary") {
    for (const m of unsettled) {
      await createPayout(escrow, m);
      m.released = true;
      m.releasedAt = new Date();
    }
  } else if (resolution === "refund_depositor") {
    for (const m of unsettled) {
      await createRefund(escrow, m);
      m.refunded = true;
      m.refundedAt = new Date();
    }
  } else {
    const pct = Number(splitPercent);
    for (const m of unsettled) {
      await createSplitPayout(escrow, m, pct);
      m.released = true;
      m.releasedAt = new Date();
      m.refunded = true;
      m.refundedAt = new Date();
      m.splitPercent = pct;
    }
  }

  settleFinalStatus(escrow);
  await escrow.save();

  await notifyDisputeResolved(escrow, resolution);

  res.json({ dispute, escrow });
}