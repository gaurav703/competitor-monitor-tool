import { connectDb, disconnectDb } from "../config/db";
import { sendDigestsForAllProducts } from "../services/notificationService";
import type { DigestRunSummary } from "../services/notificationService";

export async function runDailyDigest(): Promise<DigestRunSummary> {
  return sendDigestsForAllProducts();
}

async function main(): Promise<void> {
  await connectDb();
  console.log("Phase 4 daily digest (email only, no Slack)");
  await runDailyDigest();
}

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed: ${message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await disconnectDb();
    });
}
