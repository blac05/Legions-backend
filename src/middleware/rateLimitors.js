import rateLimit from "express-rate-limit";

/**
 * Applies to endpoints that actually move or reallocate money (milestone release,
 * dispute resolution). Keyed by authenticated user rather than IP, since these
 * routes always sit behind requireAuth - so it can't be trivially bypassed by
 * rotating IPs, and legitimate users sharing an office IP aren't penalized.
 */
export const financialActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: { error: "Too many requests. Please slow down and try again shortly." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});