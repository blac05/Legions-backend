import cron from "node-cron";
import Escrow from "../models/Escrow.js";
import Dispute from "../models/Dispute.js";

/**
 * Runs every hour. Any active escrow whose deadline has passed while at least one
 * milestone still has unmet conditions is automatically flagged as a breach and
 * locked for agent review. This is the "breach of contract should be monitored
 * by the app" requirement.
 */
export function startBreachMonitor() {
  cron.schedule("0 * * * *", async () => {
    try {
      const overdue = await Escrow.find({
        status: "active",
        disputed: false,
        deadline: { $lt: new Date() },
      });

      for (const escrow of overdue) {
        const allDelivered = escrow.milestones.every(
          (m) => m.released || m.conditions.every((c) => c.met)
        );
        if (allDelivered) continue; // deadline passed but everything was actually delivered

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

        console.log(`[legion] Auto-flagged breach for ${escrow.legionId}`);
      }
    } catch (err) {
      console.error("[legion] Breach monitor error:", err);
    }
  });
  console.log("[legion] Breach monitor cron scheduled (hourly)");
}