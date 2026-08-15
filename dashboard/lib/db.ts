import mongoose from "mongoose";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const uri = process.env.MONGODB_URI;

export async function connectDb(): Promise<typeof mongoose> {
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add it to the repo .env or dashboard/.env.local");
  }
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  return mongoose;
}
