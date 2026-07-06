import mongoose from "mongoose";

const conditionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    met: { type: Boolean, default: false },
    metAt: { type: Date },
    metBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true }
);

const milestoneSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    conditions: { type: [conditionSchema], default: [] },

    released: { type: Boolean, default: false }, // funds went (fully or partially) to the beneficiary
    releasedAt: { type: Date },

    refunded: { type: Boolean, default: false }, // funds went (fully or partially) back to the depositor
    refundedAt: { type: Date },

    // Set only when this milestone's funds were divided by a dispute resolution -
    // e.g. 60 means 60% went to the beneficiary and 40% back to the depositor.
    splitPercent: { type: Number, min: 0, max: 100 },
  },
  { _id: true }
);

const partySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    agreed: { type: Boolean, default: false },
    agreedAt: { type: Date },
  },
  { _id: false }
);

const escrowSchema = new mongoose.Schema(
  {
    legionId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String },

    depositor: { type: partySchema, required: true },
    beneficiary: { type: partySchema, required: true },

    currency: { type: String, required: true, default: "USD" },
    milestones: {
      type: [milestoneSchema],
      validate: (v) => v.length > 0,
    },

    agentFeeRate: { type: Number, required: true },
    agentFeeAmount: { type: Number, required: true },
    feeSplit: { type: String, enum: ["even", "depositor", "beneficiary"], default: "even" },

    fundingMethod: { type: String, enum: ["bank", "card", "crypto"], required: true },
    payoutMethod: { type: String, enum: ["bank", "card", "crypto"], required: true },

    deadline: { type: Date },

    status: {
      type: String,
      enum: ["pending_agreement", "active", "disputed", "completed", "cancelled", "refunded"],
      default: "pending_agreement",
    },

    fundedAt: { type: Date },

    disputed: { type: Boolean, default: false },
    disputeReason: { type: String },
    disputeRaisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

escrowSchema.virtual("totalAmount").get(function () {
  return this.milestones.reduce((sum, m) => sum + m.amount, 0);
});
escrowSchema.virtual("releasedAmount").get(function () {
  return this.milestones.filter((m) => m.released).reduce((sum, m) => sum + m.amount, 0);
});
escrowSchema.set("toJSON", { virtuals: true });
escrowSchema.set("toObject", { virtuals: true });

escrowSchema.index({ "depositor.user": 1 });
escrowSchema.index({ "beneficiary.user": 1 });

export default mongoose.model("Escrow", escrowSchema);