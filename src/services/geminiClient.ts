import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

/**
 * Error thrown when a Gemini call cannot produce a result.
 * `retryable: true` means a transient/quota failure that is worth retrying
 * later (possibly with a different model); `retryable: false` means the
 * request itself was invalid and retrying will never help.
 */
export class AnalysisError extends Error {
  retryable: boolean;
  status?: string | number;
  headers?: Record<string, string>;

  constructor(
    message: string,
    options: {
      retryable: boolean;
      status?: string | number;
      headers?: Record<string, string>;
      cause?: unknown;
    } = { retryable: false }
  ) {
    super(message, { cause: options.cause });
    this.name = "AnalysisError";
    this.retryable = options.retryable;
    this.status = options.status;
    this.headers = options.headers;
  }
}

/** True for transient failures worth retrying (quota, rate limits, outages). */
export function isRetryableQuotaError(error: unknown): boolean {
  if (error instanceof AnalysisError) {
    return error.retryable;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const status = (error as Error & { status?: unknown }).status;
  if (status === 429 || status === 503 || status === "RESOURCE_EXHAUSTED") {
    return true;
  }
  return /rate.?limit|quota|resource.exhausted|429|503/i.test(error.message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Respect the Retry-After header when the API tells us how long to wait. */
export function retryAfterMs(error: unknown, fallbackMs = 2000): number {
  const headers = (error as { headers?: Record<string, string> } | null)?.headers;
  const retryAfter = headers?.["retry-after"];
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 60_000);
    }
  }
  return fallbackMs;
}

/**
 * Process-wide "sticky" model index: once the primary model hits a quota
 * error, later calls keep starting on the fallback instead of burning the
 * primary's quota again. Reset when the process restarts.
 */
const stickyModelIndex: { current: number } = { current: 0 };

/**
 * Try a list of models in order. Retryable failures (429/quota/503) advance
 * to the next model; non-retryable failures throw immediately. When every
 * model fails with a retryable error, throws a retryable AnalysisError.
 */
export async function generateWithCascade(params: {
  models: string[];
  call: (model: string) => Promise<string>;
  waitMs?: (error: unknown) => number | void;
}): Promise<string> {
  const { models, call, waitMs } = params;
  if (models.length === 0) {
    throw new AnalysisError("No Gemini models configured", { retryable: true });
  }

  const startIndex = Math.min(stickyModelIndex.current, models.length - 1);
  let lastError: unknown = null;

  for (let i = startIndex; i < models.length; i++) {
    const model = models[i] as string;
    try {
      return await call(model);
    } catch (error: unknown) {
      lastError = error;
      if (!isRetryableQuotaError(error)) {
        throw new AnalysisError(
          error instanceof Error ? error.message : String(error),
          {
            retryable: false,
            status: (error as { status?: string | number })?.status,
            headers: (error as { headers?: Record<string, string> })?.headers,
            cause: error,
          }
        );
      }
      stickyModelIndex.current = i + 1;
      const next = models[i + 1];
      if (!next) {
        break;
      }
      const wait = waitMs ? waitMs(error) : 0;
      if (typeof wait === "number" && wait > 0) {
        await sleep(wait);
      }
    }
  }

  throw new AnalysisError(`All Gemini models exhausted (${models.join(", ")})`, {
    retryable: true,
    status: (lastError as { status?: string | number } | null)?.status,
    headers: (lastError as { headers?: Record<string, string> } | null)?.headers,
    cause: lastError,
  });
}

export async function generateGeminiText(params: {
  input: string;
  systemInstruction: string;
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  const models = [env.geminiModel, ...env.geminiModelFallbacks];

  const call = async (model: string): Promise<string> => {
    const interaction = await ai.interactions.create({
      model,
      input: params.input,
      system_instruction: params.systemInstruction,
      response_format: {
        type: "text",
        mime_type: "application/json",
      },
    });
    const text = interaction.output_text?.trim() ?? "";
    if (!text) {
      // Empty output on one model is worth trying the backup for.
      throw new AnalysisError("Gemini returned empty output.", { retryable: true });
    }
    return text;
  };

  return generateWithCascade({ models, call, waitMs: retryAfterMs });
}
