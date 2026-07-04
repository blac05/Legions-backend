import mongoose from "mongoose";

export async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`[legion] MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error("[legion] MongoDB connection failed:", err.message);
    process.exit(1);
  }
}