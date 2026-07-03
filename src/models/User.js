import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },

    country: { type: String },
    idType: { type: String, enum: ["Passport", "National ID", "Driver's License"] },
    idDocumentUrl: { type: String }, // storage URL from your file/KYC provider
    kycStatus: {
      type: String,
      enum: ["unverified", "pending", "verified", "rejected"],
      default: "unverified",
    },
    kycProviderRef: { type: String }, // reference id from KYC provider (e.g. Persona inquiry id)

    twoFA: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false }, // TOTP secret, never returned by default
      backupCodes: { type: [String], select: false },
    },

    role: { type: String, enum: ["user", "agent_admin"], default: "user" },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    fullName: this.fullName,
    email: this.email,
    phone: this.phone,
    country: this.country,
    kycStatus: this.kycStatus,
    twoFAEnabled: this.twoFA?.enabled || false,
    role: this.role,
    createdAt: this.createdAt,
  };
};

export default mongoose.model("User", userSchema);
