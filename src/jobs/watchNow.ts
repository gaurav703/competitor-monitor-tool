import { connectDb, disconnectDb } from "../config/db";
import { runWatchPipeline } from "../services/diffService";

export async function runWatchNow(): Promise<void> {
  const results = await runWatchPipeline();
  const changed = results.filter((row) => row.changed).length;
  const analyzed = results.filter((row) => row.analyzed).length;
  const errors = results.filter((row) => row.error).length;
  console.log(
    `Watch pipeline: ${results.length} source(s), ${changed} changed, ${analyzed} analyzed, ${errors} error(s)`
  );
  for (const row of results) {
    if (row.error) {
      console.log(`[ERROR] ${row.competitorName} ${row.sourceType} ${row.error}`);
      continue;
    }
    if (row.isFirstCheck && row.changed) {
      console.log(`[BASELINE] ${row.competitorName} ${row.sourceType} hash saved, Gemini skipped`);
      continue;
    }
    if (!row.changed) {
      console.log(`[UNCHANGED] ${row.competitorName} ${row.sourceType}`);
      continue;
    }
    if (row.deduped) {
      console.log(`[DUPLICATE] ${row.competitorName} ${row.sourceType} skipped as duplicate of a recent change`);
      continue;
    }
    console.log(
      `[ANALYZED] ${row.competitorName} ${row.sourceType} meaningful=${row.isMeaningful} changeLog=${row.changeLogId}`
    );
  }
}

async function main(): Promise<void> {
  await connectDb();
  await runWatchNow();
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
