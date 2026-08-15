import { timingSafeEqual } from "crypto";
import { after, NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
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

async function runCron(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = parseJob(request);
  after(async () => {
    const startedAt = Date.now();
    try {
      await connectDb();
      if (job === "watch" || job === "all") {
        await runWatchNow();
      }
      if (job === "digest" || job === "all") {
        await runDailyDigest();
      }
      console.log(`[cron] ${job} finished in ${Date.now() - startedAt}ms`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[cron] ${job} failed: ${message}`);
    }
  });

  return NextResponse.json({ ok: true, accepted: true, job }, { status: 202 });
}

export async function GET(request: Request): Promise<Response> {
  return runCron(request);
}

export async function POST(request: Request): Promise<Response> {
  return runCron(request);
}
