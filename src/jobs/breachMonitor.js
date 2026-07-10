import cron from "node-cron";
import Escrow from "../models/Escrow.js";
import Dispute from "../models/Dispute.js";
import { notifyDisputeFlagged } from "../utils/notify.js";

/**
 * The actual breach-detection logic, exported separately from the cron wrapper so
 * it can be called directly in tests (and, if you ever want it, from an admin
 * "run now" button) without needing node-cron or a scheduler in the loop.
 *
 * Any active, non-disputed escrow whose deadline has passed while at least one
 * milestone still has unmet conditions is flagged as a breach and locked for
 * agent review. Returns the list of legionIds that were flagged, for logging/tests.
 */
export async function checkAndFlagBreaches(now = new Date()) {
  const overdue = await Escrow.find({
    status: "active",
    disputed: false,
    deadline: { $lt: now },
  });

  const flagged = [];
  for (const escrow of overdue) {
    const allDelivered = escrow.milestones.every(
      (m) => m.released || m.refunded || m.conditions.every((c) => c.met)
    );
    if (allDelivered) continue;

    escrow.disputed = true;
    escrow.disputeReason = "Automatically flagged: contract deadline passed with unmet milestone conditions.";
    escrow.status = "disputed";
    await escrow.save();

    await Dispute.create({
      escrow: escrow._id,
      raisedBy: escrow.depositor.user,
      reason: escrow.disputeReason,
      status: "open",
      autoFlagged: true,
    });

    await notifyDisputeFlagged(escrow, { autoFlagged: true });

    flagged.push(escrow.legionId);
  }
  return flagged;
}

export function startBreachMonitor() {
  cron.schedule("0 * * * *", async () => {
    try {
      const flagged = await checkAndFlagBreaches();
      flagged.forEach((id) => console.log(`[legion] Auto-flagged breach for ${id}`));
    } catch (err) {
      console.error("[legion] Breach monitor error:", err);
    }
  });
  console.log("[legion] Breach monitor cron scheduled (hourly)");
}