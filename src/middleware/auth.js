import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing authentication token" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: "Invalid session" });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Not authorized for this action" });
    }
    next();
  };
}
// Add this to the bottom of src/middleware/auth.js
export function requireVerifiedEmail(req, res, next) {
  // requireAuth must run before this to populate req.user
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Check the email verification flag from your User Model
  if (!req.user.emailVerified) {
    return res.status(403).json({ 
      error: "Your email address must be verified to perform this action.",
      requiresVerification: true 
    });
  }

  next();
}