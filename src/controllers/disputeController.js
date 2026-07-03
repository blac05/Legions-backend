import Dispute from "../models/Dispute.js";
import Escrow from "../models/Escrow.js";
import { createPayout } from "./paymentController.js";

// GET /api/disputes  (agent_admin only) - full queue for the ops console
export async function listDisputes(req, res) {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const disputes = await Dispute.find(filter).populate("escrow").sort({ createdAt: -1 });
  res.json({ disputes });
}

// GET /api/disputes/mine - disputes on contracts the current user is part of
export async function listMyDisputes(req, res) {
  const myEscrows = await Escrow.find({
    $or: [{ "depositor.user": req.user._id }, { "beneficiary.user": req.user._id }],
  }).select("_id");
  const disputes = await Dispute.find({ escrow: { $in: myEscrows.map((e) => e._id) } })
    .populate("escrow")
    .sort({ createdAt: -1 });
  res.json({ disputes });
}

// POST /api/disputes/:id/resolve  (agent_admin only)  { resolution, notes }
// resolution: "release_to_beneficiary" | "refund_depositor" | "split"
// Applies to all currently-unreleased milestones on the contract.
export async function resolveDispute(req, res) {
  const { resolution, notes } = req.body;
  if (!["release_to_beneficiary", "refund_depositor", "split"].includes(resolution)) {
    return res.status(400).json({ error: "Invalid resolution type" });
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
  const unreleased = escrow.milestones.filter((m) => !m.released);

  if (resolution === "release_to_beneficiary") {
    for (const m of unreleased) {
      await createPayout(escrow, m);
      m.released = true;
      m.releasedAt = new Date();
    }
    escrow.status = escrow.milestones.every((m) => m.released) ? "completed" : "active";
  } else if (resolution === "refund_depositor") {
    escrow.status = "refunded";
    // TODO: trigger a refund of unreleased milestone totals back to the depositor's funding method
  } else {
    // split: agent decides a partial release per resolutionNotes; left for manual/admin follow-up
    escrow.status = "active";
    // TODO: parse resolutionNotes for a per-milestone split and trigger partial payouts
  }
  await escrow.save();

  res.json({ dispute, escrow });
}
