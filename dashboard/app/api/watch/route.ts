import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { runWatchForUserProduct } from "../../../../src/services/diffService";

export const dynamic = "force-dynamic";
// Manual action; the pipeline may take a while with many sources.
export const maxDuration = 120;

type RowSummary = {
  competitorName: string;
  sourceType: string;
  changed: boolean;
  analyzed: boolean;
  deduped: boolean;
  skipped: boolean;
  isFirstCheck: boolean;
  meaningful: boolean | null;
  error: string | null;
};

export async function POST(request: Request) {
  await connectDb();
  const body = (await request.json()) as { userProductId?: string };
  const userProductId = body.userProductId?.trim();
  if (!userProductId) {
    return NextResponse.json({ error: "userProductId is required." }, { status: 400 });
  }

  try {
    const results = await runWatchForUserProduct(userProductId, { analyze: true });
    const rows: RowSummary[] = results.map((row) => ({
      competitorName: row.competitorName,
      sourceType: row.sourceType,
      changed: row.changed,
      analyzed: row.analyzed,
      deduped: row.deduped,
      skipped: row.skipped,
      isFirstCheck: row.isFirstCheck,
      meaningful: row.isMeaningful,
      error: row.error,
    }));

    return NextResponse.json({
      ok: true,
      summary: {
        total: results.length,
        changed: results.filter((row) => row.changed).length,
        analyzed: results.filter((row) => row.analyzed).length,
        duplicates: results.filter((row) => row.deduped).length,
        errors: results.filter((row) => row.error).length,
        skipped: results.filter((row) => row.skipped).length,
        rows,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
