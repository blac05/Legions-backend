import mongoose from "mongoose";

const disputeSchema = new mongoose.Schema(
  {
    escrow: { type: mongoose.Schema.Types.ObjectId, ref: "Escrow", required: true },
    milestoneId: { type: mongoose.Schema.Types.ObjectId }, // optional - which milestone triggered this, if any
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: { type: String, required: true },
    evidenceUrls: { type: [String], default: [] },
    status: { type: String, enum: ["open", "under_review", "resolved"], default: "open" },
    resolution: {
      type: String,
      enum: ["release_to_beneficiary", "refund_depositor", "split", null],
      default: null,
    },
    resolutionNotes: { type: String },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
    autoFlagged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Dispute", disputeSchema);
