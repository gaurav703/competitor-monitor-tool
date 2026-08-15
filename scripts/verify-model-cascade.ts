/**
 * Runtime verification of the Gemini model cascade in
 * src/services/geminiClient.ts. Run with:
 *
 *   npx tsx scripts/verify-model-cascade.ts            # classification only
 *   npx tsx scripts/verify-model-cascade.ts --case X   # one cascade scenario
 *
 * The cascade keeps a process-wide "sticky" model index (after the primary
 * hits quota it stays on the fallback), so each scenario runs in a fresh
 * process to start from a clean index.
 *
 * Scenarios (no real Gemini API calls):
 *  fallback-succeeds  primary 429 -> next model succeeds
 *  sticky             next call skips the failed primary
 *  all-fail           every model 429 -> AnalysisError retryable=true
 *  non-retryable      400 fails fast, backup never called
 *  retry-after        Retry-After header reaches the wait function
 */
import {
  AnalysisError,
  generateWithCascade,
  isRetryableQuotaError,
} from "../src/services/geminiClient";

function quotaError(status: string | number, message: string, headers?: Record<string, string>): Error {
  const error = new Error(message) as Error & { status: string | number; headers?: Record<string, string> };
  error.status = status;
  if (headers) {
    error.headers = headers;
  }
  return error;
}

let failures = 0;
function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`ok   ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name}`);
  }
}

function finish(): never {
  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
  process.exit(0);
}

function classificationChecks(): void {
  check("429 status is retryable", isRetryableQuotaError(quotaError(429, "quota")));
  check("RESOURCE_EXHAUSTED status is retryable", isRetryableQuotaError(quotaError("RESOURCE_EXHAUSTED", "quota")));
  check("503 status is retryable", isRetryableQuotaError(quotaError(503, "unavailable")));
  check("'rate limit' message is retryable", isRetryableQuotaError(new Error("RATE_LIMIT_EXCEEDED: try again later")));
  check("'quota exceeded' message is retryable", isRetryableQuotaError(new Error("Quota exceeded for model")));
  check("400 invalid argument is NOT retryable", !isRetryableQuotaError(quotaError(400, "InvalidArgument: bad prompt")));
  check("JSON parse error is NOT retryable", !isRetryableQuotaError(new Error("No JSON object in model response")));
}

async function caseFallbackSucceeds(): Promise<void> {
  const calls: string[] = [];
  const result = await generateWithCascade({
    models: ["primary", "backup"],
    call: async (model) => {
      calls.push(model);
      if (model === "primary") {
        throw quotaError(429, "Quota exceeded", { "retry-after": "2" });
      }
      return `output-from-${model}`;
    },
    waitMs: () => 1,
  });
  check("primary 429 falls back and succeeds", result === "output-from-backup");
  check("fallback tried primary then backup", calls.join(",") === "primary,backup");
  finish();
}

async function caseSticky(): Promise<void> {
  // Establish index 1: primary 429s, backup succeeds.
  await generateWithCascade({
    models: ["primary", "backup"],
    call: async (model) => {
      if (model === "primary") {
        throw quotaError(429, "Quota exceeded");
      }
      return "ok";
    },
    waitMs: () => 1,
  });

  // Next call must skip the failed primary and start at the backup.
  const calls: string[] = [];
  const result = await generateWithCascade({
    models: ["primary", "backup", "backup2"],
    call: async (model) => {
      calls.push(model);
      if (model === "primary") {
        throw quotaError(429, "primary should have been skipped");
      }
      if (model === "backup") {
        throw quotaError(429, "Quota exceeded");
      }
      return `output-from-${model}`;
    },
    waitMs: () => 1,
  });
  check("sticky index skips the failed primary", calls.join(",") === "backup,backup2");
  check("sticky fallback succeeds", result === "output-from-backup2");
  finish();
}

async function caseAllFail(): Promise<void> {
  let allFailed = false;
  try {
    await generateWithCascade({
      models: ["p1", "p2"],
      call: async (model) => {
        throw quotaError(429, `Quota for ${model}`);
      },
      waitMs: () => 1,
    });
  } catch (error: unknown) {
    allFailed =
      error instanceof AnalysisError &&
      error.retryable === true &&
      error.message.includes("All Gemini models exhausted (p1, p2)");
  }
  check("all models 429 -> retryable AnalysisError", allFailed);
  finish();
}

async function caseNonRetryable(): Promise<void> {
  let nonRetryableFast = false;
  const calls: string[] = [];
  try {
    await generateWithCascade({
      models: ["primary", "backup"],
      call: async (model) => {
        calls.push(model);
        throw quotaError(400, "InvalidArgument: bad prompt");
      },
      waitMs: () => 1,
    });
  } catch (error: unknown) {
    nonRetryableFast =
      error instanceof AnalysisError && error.retryable === false && calls.length === 1;
  }
  check("non-retryable fails fast, backup not called", nonRetryableFast);
  finish();
}

async function caseRetryAfter(): Promise<void> {
  const retryAfterError = quotaError(429, "Quota exceeded", { "retry-after": "12" });
  let waitedOn: unknown = null;
  await generateWithCascade({
    models: ["primary", "backup"],
    call: async (model) => {
      if (model === "primary") {
        throw retryAfterError;
      }
      return "ok";
    },
    waitMs: (error) => {
      waitedOn = error;
      return 1;
    },
  });
  const headers = (waitedOn as { headers?: Record<string, string> } | null)?.headers;
  check("Retry-After header reaches the wait function", headers?.["retry-after"] === "12");
  finish();
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const caseArg = arg === "--case" ? process.argv[3] : undefined;
  classificationChecks();
  if (!caseArg) {
    finish();
  }
  switch (caseArg) {
    case "fallback-succeeds":
      await caseFallbackSucceeds();
      break;
    case "sticky":
      await caseSticky();
      break;
    case "all-fail":
      await caseAllFail();
      break;
    case "non-retryable":
      await caseNonRetryable();
      break;
    case "retry-after":
      await caseRetryAfter();
      break;
    default:
      console.error(`Unknown case: ${caseArg}`);
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
