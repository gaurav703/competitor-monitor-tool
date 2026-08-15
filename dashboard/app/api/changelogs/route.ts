import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { ChangeLogModel, CompetitorModel } from "@/lib/models";

export async function GET(request: Request) {
  await connectDb();
  const { searchParams } = new URL(request.url);
  const userProductId = searchParams.get("userProductId");
  const includeNoise = searchParams.get("includeNoise") === "true";

  if (!userProductId) {
    return NextResponse.json({ error: "userProductId is required." }, { status: 400 });
  }

  const competitors = await CompetitorModel.find({ userProductId }).lean<{
    _id: { toString(): string };
    name: string;
  }[]>();
  const competitorIds = competitors.map((row) => row._id);
  const nameById = new Map(competitors.map((row) => [row._id.toString(), row.name]));

  const query: Record<string, unknown> = { competitorId: { $in: competitorIds } };
  if (!includeNoise) {
    query.isMeaningful = true;
  }

  const logs = await ChangeLogModel.find(query).sort({ detectedAt: -1 }).lean<{
    _id: { toString(): string };
    competitorId: { toString(): string };
    rawDiff: { url?: string } | null;
    sourceType: string;
    detectedAt: Date;
    relevantArea: string | null;
    urgency: string | null;
    aiSummary: string | null;
    isMeaningful: boolean;
  }[]>();

  const payload = logs.map((log) => {
    const raw = log.rawDiff as { url?: string } | null;
    return {
      id: log._id.toString(),
      competitorId: log.competitorId.toString(),
      competitorName: nameById.get(log.competitorId.toString()) ?? "Unknown",
      sourceType: log.sourceType,
      sourceUrl: raw?.url ?? null,
      detectedAt: log.detectedAt,
      relevantArea: log.relevantArea,
      urgency: log.urgency,
      aiSummary: log.aiSummary,
      isMeaningful: log.isMeaningful,
    };
  });

  return NextResponse.json({ userProductId, items: payload });
}
