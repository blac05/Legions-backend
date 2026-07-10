import mongoose from "mongoose";

const idempotencyKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    route: { type: String, required: true }, // logical route name, e.g. "release_milestone"
    status: { type: String, enum: ["pending", "done"], default: "pending" },
    statusCode: { type: Number },
    responseBody: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// One record per (key, user, route) - lets the same raw key be reused safely
// across different actions without colliding.
idempotencyKeySchema.index({ key: 1, user: 1, route: 1 }, { unique: true });

// Records are only needed long enough to catch a retried request; expire them
// after 24 hours so the collection doesn't grow unbounded.
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export default mongoose.model("IdempotencyKey", idempotencyKeySchema);