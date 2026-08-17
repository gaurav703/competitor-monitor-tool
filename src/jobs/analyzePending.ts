import { ChangeLogModel, CompetitorModel, UserProductModel } from "../models";
import { isGeminiConfigured } from "../config/env";
import { analyzeChange } from "../services/aiAnalysisService";
import type { DiffForAnalysis, UserProductContext } from "../services/aiAnalysisService";

/** How many times a pending ChangeLog is retried before being marked failed. */
const MAX_ATTEMPTS = 3;

/** Space retries out so a backup model on 15 RPM never gets 429ed too. */
const SLEEP_BETWEEN_LOGS_MS = 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rawDiffToAnalysisInput(rawDiff: unknown): DiffForAnalysis | null {
  if (!rawDiff || typeof rawDiff !== "object") {
    return null;
  }
  const raw = rawDiff as Partial<DiffForAnalysis> & { content?: string };
  if (typeof raw.url !== "string" || typeof raw.content !== "string") {
    return null;
  }
  return {
    url: raw.url,
    isFirstCheck: Boolean(raw.isFirstCheck),
    previousHash: typeof raw.previousHash === "string" ? raw.previousHash : null,
    currentHash: typeof raw.currentHash === "string" ? raw.currentHash : "",
    content: raw.content,
  };
}

/**
 * Re-run Gemini on ChangeLogs saved as "pending" (every model hit a
 * quota/transient error during the original watch). The rawDiff was stored
 * with the log, so this retries analysis only — no second fetch.
 *
 * Success updates the same ChangeLog in place (aiSummary, isMeaningful, ...)
 * so the dashboard and digest pick it up like any other analyzed log.
 */
export async function retryPendingAnalyses(): Promise<{
  retried: number;
  succeeded: number;
  failed: number;
}> {
  if (!isGeminiConfigured()) {
    console.warn("GEMINI_API_KEY is missing; skipping pending analysis retries.");
    return { retried: 0, succeeded: 0, failed: 0 };
  }

  const pending = await ChangeLogModel.find({
    analysisStatus: "pending",
    analysisAttempts: { $lt: MAX_ATTEMPTS },
  })
    .sort({ detectedAt: 1 })
    .lean();

  if (pending.length === 0) {
    return { retried: 0, succeeded: 0, failed: 0 };
  }
  console.log(`Retrying ${pending.length} pending analysis(es)...`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const log = pending[i];
    if (!log) {
      continue;
    }
    const competitor = await CompetitorModel.findById(log.competitorId).lean();
    const userProduct =
      competitor && competitor.userProductId
        ? await UserProductModel.findById(competitor.userProductId).lean()
        : null;
    const input = rawDiffToAnalysisInput(log.rawDiff);

    if (!competitor || !userProduct || !input) {
      // Missing referents or a corrupt rawDiff can never be retried.
      await ChangeLogModel.updateOne(
        { _id: log._id },
        {
          $set: {
            analysisStatus: "failed",
            analysisError: "Missing competitor/userProduct or corrupt rawDiff; cannot retry.",
          },
          $inc: { analysisAttempts: 1 },
        }
      );
      failed++;
      continue;
    }

    const userProductContext: UserProductContext = {
      name: userProduct.name,
      industry: userProduct.industry,
      description: userProduct.description,
    };

    try {
      const analysis = await analyzeChange(
        userProductContext,
        competitor.name,
        log.sourceType,
        input
      );
      await ChangeLogModel.updateOne(
        { _id: log._id },
        {
          $set: {
            aiSummary: analysis.aiSummary,
            relevantArea: analysis.relevantArea,
            urgency: analysis.urgency,
            isMeaningful: analysis.isMeaningful,
            analysisStatus: "analyzed",
            analysisError: null,
            // Re-enter the 24h digest window so a change recovered after a
            // long quota outage still reaches the daily email.
            detectedAt: new Date(),
          },
          $inc: { analysisAttempts: 1 },
        }
      );
      succeeded++;
      console.log(
        `[RETRIED OK] ${competitor.name} ${log.sourceType} meaningful=${analysis.isMeaningful}`
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const attemptsAfter = (log.analysisAttempts ?? 0) + 1;
      const giveUp = attemptsAfter >= MAX_ATTEMPTS;
      await ChangeLogModel.updateOne(
        { _id: log._id },
        {
          $set: {
            analysisStatus: giveUp ? "failed" : "pending",
            analysisError: message,
          },
          $inc: { analysisAttempts: 1 },
        }
      );
      failed++;
      console.warn(
        `[RETRY FAILED] ${competitor.name} ${log.sourceType} attempts=${attemptsAfter}/${MAX_ATTEMPTS}${giveUp ? " (giving up)" : ""}: ${message}`
      );
    }

    // Pace retries so the backup model's RPM isn't exhausted too.
    if (i < pending.length - 1) {
      await sleep(SLEEP_BETWEEN_LOGS_MS);
    }
  }

  console.log(`Pending retries done: ${succeeded} succeeded, ${failed} failed.`);
  return { retried: pending.length, succeeded, failed };
}
