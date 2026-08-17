import { timingSafeEqual } from "crypto";
import { after, NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { retryPendingAnalyses } from "../../../../../src/jobs/analyzePending";
import { runDailyDigest } from "../../../../../src/jobs/dailyDigest";
import { runWatchNow } from "../../../../../src/jobs/watchNow";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type CronJob = "watch" | "digest" | "all";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return false;
  }
  const { searchParams } = new URL(request.url);
  const fromQuery = searchParams.get("secret")?.trim() ?? "";
  const header = request.headers.get("authorization") ?? "";
  const fromHeader = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : request.headers.get("x-cron-secret")?.trim() ?? "";
  return secretsMatch(fromQuery, expected) || secretsMatch(fromHeader, expected);
}

function secretsMatch(provided: string, expected: string): boolean {
  if (!provided) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function parseJob(request: Request): CronJob {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("job")?.trim() ?? "all";
  if (raw === "watch" || raw === "digest" || raw === "all") {
    return raw;
  }
  return "all";
}

async function runCronWork(job: CronJob): Promise<void> {
  const startedAt = Date.now();
  await connectDb();

  const watch =
    job === "watch" || job === "all"
      ? await runWatchNow({ deferAnalysis: true, fetchConcurrency: 4 })
      : null;
  const pendingRetries =
    job === "watch" || job === "digest" || job === "all"
      ? await retryPendingAnalyses()
      : null;
  const digest = job === "digest" || job === "all" ? await runDailyDigest() : null;

  console.log(
    `[cron] ${job} finished in ${Date.now() - startedAt}ms watch=${watch ? watch.changed + " changed" : "skipped"} pendingRetries=${pendingRetries?.retried ?? 0} digest=${digest ? (digest.emailSent ? "sent" : "not_sent") : "skipped"}`
  );
}

function acceptCron(request: Request): Response {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = parseJob(request);
  console.log(`[cron] ${job} accepted`);
  after(async () => {
    try {
      await runCronWork(job);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[cron] ${job} failed: ${message}`);
    }
  });

  return NextResponse.json({ ok: true, accepted: true, job }, { status: 202 });
}

export async function GET(request: Request): Promise<Response> {
  return acceptCron(request);
}

export async function POST(request: Request): Promise<Response> {
  return acceptCron(request);
}
