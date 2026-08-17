import { connectDb, disconnectDb } from "../config/db";
import { runWatchPipeline } from "../services/diffService";
import type { DiffCheckResult, WatchOptions } from "../services/diffService";

export type WatchSourceStatus =
  | "error"
  | "skipped"
  | "baseline"
  | "unchanged"
  | "duplicate"
  | "pending"
  | "analyzed";

export type WatchSourceRow = {
  competitorName: string;
  sourceType: string;
  url: string;
  status: WatchSourceStatus;
  changed: boolean;
  analyzed: boolean;
  meaningful: boolean | null;
  error: string | null;
  changeLogId: string | null;
};

export type WatchRunSummary = {
  total: number;
  fetched: number;
  unchanged: number;
  baselines: number;
  changed: number;
  analyzed: number;
  pending: number;
  meaningful: number;
  duplicates: number;
  skipped: number;
  errors: number;
  sources: WatchSourceRow[];
};

export function watchSourceStatus(row: DiffCheckResult): WatchSourceStatus {
  if (row.error) {
    return "error";
  }
  if (row.skipped) {
    return "skipped";
  }
  if (row.isFirstCheck && row.changed) {
    return "baseline";
  }
  if (!row.changed) {
    return "unchanged";
  }
  if (row.deduped) {
    return "duplicate";
  }
  if (row.changeLogId && !row.analyzed) {
    return "pending";
  }
  return "analyzed";
}

export function summarizeWatchResults(results: DiffCheckResult[]): WatchRunSummary {
  const sources = results.map((row) => ({
    competitorName: row.competitorName,
    sourceType: row.sourceType,
    url: row.url,
    status: watchSourceStatus(row),
    changed: row.changed,
    analyzed: row.analyzed,
    meaningful: row.isMeaningful,
    error: row.error,
    changeLogId: row.changeLogId,
  }));

  return {
    total: results.length,
    fetched: results.filter((row) => !row.error && !row.skipped).length,
    unchanged: results.filter((row) => watchSourceStatus(row) === "unchanged").length,
    baselines: results.filter((row) => watchSourceStatus(row) === "baseline").length,
    changed: results.filter((row) => row.changed && !row.error && !row.skipped).length,
    analyzed: results.filter((row) => row.analyzed).length,
    pending: results.filter((row) => watchSourceStatus(row) === "pending").length,
    meaningful: results.filter((row) => row.isMeaningful === true).length,
    duplicates: results.filter((row) => row.deduped).length,
    skipped: results.filter((row) => row.skipped).length,
    errors: results.filter((row) => row.error).length,
    sources,
  };
}

export async function runWatchNow(options: WatchOptions = {}): Promise<WatchRunSummary> {
  const results = await runWatchPipeline(options);
  const summary = summarizeWatchResults(results);
  console.log(
    `Watch pipeline: ${summary.total} source(s), ${summary.fetched} fetched, ${summary.changed} changed, ${summary.analyzed} analyzed, ${summary.pending} pending, ${summary.errors} error(s)`
  );
  for (const row of summary.sources) {
    if (row.status === "error") {
      console.log(`[ERROR] ${row.competitorName} ${row.sourceType} ${row.error}`);
      continue;
    }
    if (row.status === "baseline") {
      console.log(`[BASELINE] ${row.competitorName} ${row.sourceType} hash saved, Gemini skipped`);
      continue;
    }
    if (row.status === "skipped") {
      console.log(`[SKIPPED] ${row.competitorName} ${row.sourceType} source is disabled`);
      continue;
    }
    if (row.status === "unchanged") {
      console.log(`[UNCHANGED] ${row.competitorName} ${row.sourceType}`);
      continue;
    }
    if (row.status === "duplicate") {
      console.log(`[DUPLICATE] ${row.competitorName} ${row.sourceType} skipped as duplicate of a recent change`);
      continue;
    }
    if (row.status === "pending") {
      console.log(`[PENDING] ${row.competitorName} ${row.sourceType} changeLog=${row.changeLogId}`);
      continue;
    }
    console.log(
      `[ANALYZED] ${row.competitorName} ${row.sourceType} meaningful=${row.meaningful} changeLog=${row.changeLogId}`
    );
  }
  return summary;
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
