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

  // --- Pagination ---
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

  // --- Filters ---
  const query: Record<string, unknown> = { competitorId: { $in: competitorIds } };
  if (!includeNoise) {
    query.isMeaningful = true;
  }

  const filterCompetitorId = searchParams.get("competitorId");
  if (filterCompetitorId && competitorIds.some((id) => id.toString() === filterCompetitorId)) {
    query.competitorId = filterCompetitorId;
  }

  const urgency = searchParams.get("urgency");
  if (urgency && ["low", "medium", "high"].includes(urgency)) {
    query.urgency = urgency;
  }

  const area = searchParams.get("area");
  if (area) {
    query.relevantArea = { $regex: area, $options: "i" };
  }

  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) dateFilter.$lte = new Date(dateTo);
    query.detectedAt = dateFilter;
  }

  const [total, logs] = await Promise.all([
    ChangeLogModel.countDocuments(query),
    ChangeLogModel.find(query)
      .sort({ detectedAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean<{
        _id: { toString(): string };
        competitorId: { toString(): string };
        rawDiff: { url?: string; content?: string; sourceType?: string } | null;
        sourceType: string;
        detectedAt: Date;
        relevantArea: string | null;
        urgency: string | null;
        aiSummary: string | null;
        isMeaningful: boolean;
      }[]>(),
  ]);

  const payload = logs.map((log) => {
    const raw = log.rawDiff as { url?: string; content?: string } | null;
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
      rawDiffContent: raw?.content ?? null,
    };
  });

  return NextResponse.json({
    userProductId,
    items: payload,
    total,
    offset,
    limit,
  });
}
