import User from "../models/User.js";
import { sendContractNotification } from "./email.js";

/**
 * Notifications never block the action that triggered them - if the (currently
 * stubbed) delivery mechanism fails, that's a shame, not a reason to fail a
 * fund release or dispute resolution that already succeeded. Every call site
 * in this file swallows and logs its own errors for that reason.
 */
async function notifyEmail(email, subject, message) {
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    // Falls back to a plain { email } if we can't find the account record for
    // some reason - sendContractNotification only needs `.email` to address it.
    await sendContractNotification(user || { email }, subject, message);
  } catch (err) {
    console.error(`[legion] Notification to ${email} failed:`, err.message);
  }
}

export async function notifyBothParties(escrow, subject, messageFor) {
  await Promise.all([
    notifyEmail(escrow.depositor.email, subject, messageFor("depositor")),
    notifyEmail(escrow.beneficiary.email, subject, messageFor("beneficiary")),
  ]);
}

export async function notifyContractInvite(escrow) {
  const inviter = escrow.depositor.agreed ? escrow.depositor : escrow.beneficiary;
  const invitee = escrow.depositor.agreed ? escrow.beneficiary : escrow.depositor;
  await notifyEmail(
    invitee.email,
    `New Legion contract: ${escrow.title}`,
    `${inviter.name} has invited you to a Legion escrow contract "${escrow.title}" (${escrow.legionId}). Log in to review the terms and accept.`
  );
}

export async function notifyContractActive(escrow) {
  await notifyBothParties(
    escrow,
    `Contract active: ${escrow.title}`,
    () => `Both parties have accepted "${escrow.title}" (${escrow.legionId}). Funds are being collected from the depositor.`
  );
}

export async function notifyMilestoneReleased(escrow, milestone) {
  await notifyBothParties(
    escrow,
    `Milestone released: ${milestone.title}`,
    (role) => role === "beneficiary"
      ? `"${milestone.title}" on ${escrow.legionId} has been released to you.`
      : `"${milestone.title}" on ${escrow.legionId} has been released to ${escrow.beneficiary.name}.`
  );
}

export async function notifyDisputeFlagged(escrow, { autoFlagged = false } = {}) {
  await notifyBothParties(
    escrow,
    `Contract flagged for review: ${escrow.title}`,
    () => autoFlagged
      ? `Legion automatically flagged "${escrow.title}" (${escrow.legionId}) because its deadline passed with conditions unmet. Funds are locked pending review.`
      : `"${escrow.title}" (${escrow.legionId}) has been flagged for a possible breach. Funds are locked pending review.`
  );
}

export async function notifyDisputeResolved(escrow, resolution) {
  const outcomeText = {
    release_to_beneficiary: "in the beneficiary's favor — remaining funds have been released.",
    refund_depositor: "in the depositor's favor — remaining funds are being refunded.",
    split: "as a split between both parties.",
  }[resolution] || "and the contract has been updated.";

  await notifyBothParties(
    escrow,
    `Dispute resolved: ${escrow.title}`,
    () => `Legion has resolved the dispute on "${escrow.title}" (${escrow.legionId}) ${outcomeText}`
  );
}

export async function notifyCancellationRequested(escrow, requestedByRole) {
  const other = requestedByRole === "depositor" ? escrow.beneficiary : escrow.depositor;
  await notifyEmail(
    other.email,
    `Cancellation requested: ${escrow.title}`,
    `The other party has requested to cancel "${escrow.title}" (${escrow.legionId}). Log in to confirm or decline.`
  );
}

export async function notifyCancelled(escrow) {
  await notifyBothParties(
    escrow,
    `Contract cancelled: ${escrow.title}`,
    () => `"${escrow.title}" (${escrow.legionId}) has been cancelled. No funds moved and no fee was charged.`
  );
}