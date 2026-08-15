import cron from "node-cron";
import { connectDb, disconnectDb } from "../config/db";
import { runDailyDigest } from "./dailyDigest";
import { runWatchNow } from "./watchNow";

export type HandlerEvent = {
  job?: "watch" | "digest" | "all";
};

/**
 * AWS Lambda-compatible one-shot handler.
 * EventBridge can pass `{ "job": "watch" | "digest" | "all" }`.
 */
export async function handler(event: HandlerEvent = {}): Promise<{ ok: true; job: string }> {
  const job = event.job ?? "all";
  await connectDb();
  try {
    if (job === "watch" || job === "all") {
      await runWatchNow();
    }
    if (job === "digest" || job === "all") {
      await runDailyDigest();
    }
    return { ok: true, job };
  } finally {
    await disconnectDb();
  }
}

export function startScheduler(): void {
  cron.schedule("0 */12 * * *", () => {
    console.log(`[cron] 12h watch pipeline ${new Date().toISOString()}`);
    connectDb()
      .then(() => runWatchNow())
      .catch((error: unknown) => {
        console.error(error);
      });
  });

  cron.schedule("0 8 * * *", () => {
    console.log(`[cron] daily digest ${new Date().toISOString()}`);
    connectDb()
      .then(() => runDailyDigest())
      .catch((error: unknown) => {
        console.error(error);
      });
  });

  console.log("Scheduler running (long-lived process).");
  console.log("  Watch + Gemini pipeline: every 12 hours (0 */12 * * *)");
  console.log("  Email digest: daily at 08:00 (0 8 * * *)");
  console.log("  One-shot: npm run watch-now | npm run daily-digest");
}

async function main(): Promise<void> {
  await connectDb();
  startScheduler();
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed: ${message}`);
    process.exitCode = 1;
  });
}
