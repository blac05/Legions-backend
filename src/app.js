import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";

import { errorHandler, notFound } from "./middleware/errorHandler.js";

import authRoutes from "./routes/authRoutes.js";
import escrowRoutes from "./routes/escrowRoutes.js";
import disputeRoutes from "./routes/disputeRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import registrationRoutes from './routes/registration.js';

/**
 * Builds the Express app without connecting to a database, starting the cron job,
 * or binding to a port - so tests (and anything else that wants the app in
 * isolation) can import it directly via `import app from "../src/app.js"` and
 * wrap it with supertest.
 */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
  if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

  // Stripe webhook needs the raw body, so mount it BEFORE express.json()
  app.post("/api/payments/stripe/webhook", express.raw({ type: "application/json" }));

  app.use(express.json({ limit: "2mb" }));
  app.use(mongoSanitize());

  if (process.env.NODE_ENV !== "test") {
    const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
    app.use("/api", limiter);
  }

  app.get("/api/health", (req, res) => res.json({ status: "ok", service: "legion-backend" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/escrows", escrowRoutes);
  app.use("/api/disputes", disputeRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use('/', registrationRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp();
