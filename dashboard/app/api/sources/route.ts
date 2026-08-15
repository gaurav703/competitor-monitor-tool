import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { CompetitorModel } from "@/lib/models";

export async function PATCH(request: Request) {
  await connectDb();
  const body = (await request.json()) as {
    competitorId?: string;
    sourceId?: string;
    selector?: string;
  };

  const competitorId = body.competitorId?.trim();
  const sourceId = body.sourceId?.trim();
  if (!competitorId || !sourceId) {
    return NextResponse.json({ error: "competitorId and sourceId are required." }, { status: 400 });
  }

  const competitor = await CompetitorModel.findById(competitorId);
  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }

  const source = competitor.sources.find((row) => row._id && row._id.toString() === sourceId);
  if (!source) {
    return NextResponse.json({ error: "Source not found on this competitor." }, { status: 404 });
  }

  if (source.type !== "website") {
    return NextResponse.json(
      { error: "CSS selectors only apply to website sources." },
      { status: 400 }
    );
  }

  const selector = (body.selector ?? "").trim() || null;
  await CompetitorModel.updateOne(
    { _id: competitorId, "sources._id": sourceId },
    { $set: { "sources.$.selector": selector } }
  );

  return NextResponse.json({ ok: true, sourceId, selector });
}

export const dynamic = "force-dynamic";
