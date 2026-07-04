import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";

import { connectDB } from "./src/config/db.js";
import { errorHandler, notFound } from "./src/middleware/errorHandler.js";
import { startBreachMonitor } from "./src/jobs/breachMonitor.js";

import authRoutes from "./src/routes/authRoutes.js";
import escrowRoutes from "./src/routes/escrowRoutes.js";
import disputeRoutes from "./src/routes/disputeRoutes.js";
import paymentRoutes from "./src/routes/paymentRoutes.js";

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
app.use(morgan("dev"));

// Stripe webhook needs the raw body, so mount it BEFORE express.json()
app.post("/api/payments/stripe/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "2mb" }));
app.use(mongoSanitize());

// General API limiter. Auth routes (login/register/password reset) have their own,
// stricter limiter defined in authRoutes.js since they're the main brute-force surface.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use("/api", limiter);

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "legion-backend" }));

app.use("/api/auth", authRoutes);
app.use("/api/escrows", escrowRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/payments", paymentRoutes);

app.use(notFound);
app.use(errorHandler);

// Completely portless, pipeless initialization using the Node.js event loop
connectDB().then(() => {
  console.log(`[legion] Backend successfully initialized in dynamic worker mode.`);
  
  // Directly boot your background job worker
  startBreachMonitor();

  // Keeps the Node.js process alive indefinitely so background tasks execute continuously
  setInterval(() => {}, 1 << 30);
});