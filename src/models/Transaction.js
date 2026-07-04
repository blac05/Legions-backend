import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    escrow: { type: mongoose.Schema.Types.ObjectId, ref: "Escrow", required: true },
    type: { type: String, enum: ["deposit", "payout", "fee", "refund"], required: true },
    method: { type: String, enum: ["bank", "card", "crypto"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    provider: { type: String }, // "stripe" | "bank_provider" | "crypto_provider"
    providerRef: { type: String }, // external payment id
    status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", transactionSchema);