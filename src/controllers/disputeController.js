import Dispute from "../models/Dispute.js";
import Escrow from "../models/Escrow.js";
import { createPayout, createSplitPayout } from "./paymentController.js";

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

// POST /api/disputes/:id/resolve  (agent_admin only)
// body: { resolution: "release_to_beneficiary" | "refund_depositor" | "split", notes, splitPercent }
// splitPercent (0-100) is the share that goes to the beneficiary; only used when resolution === "split".
// Applies to all currently-unreleased milestones on the contract.
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
    // TODO: trigger an actual refund of the unreleased milestone totals through
    // whichever provider handled the deposit (Stripe refund, bank reversal, etc).
  } else {
    // split: divide each unreleased milestone between beneficiary and depositor.
    const pct = Number(splitPercent);
    for (const m of unreleased) {
      await createSplitPayout(escrow, m, pct);
      m.released = true;
      m.releasedAt = new Date();
      m.splitPercent = pct;
    }
    escrow.status = escrow.milestones.every((m) => m.released) ? "completed" : "active";
  }
  await escrow.save();

  res.json({ dispute, escrow });
}