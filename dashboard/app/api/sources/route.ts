import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { CompetitorModel, SOURCE_TYPES, type SourceType } from "@/lib/models";
import { normalizeHttpUrl } from "../../../../src/services/discoverSources";

export const dynamic = "force-dynamic";

type SourcePatchBody = {
  competitorId?: string;
  sourceId?: string;
  selector?: string;
  enabled?: boolean;
};

function parseIds(body: SourcePatchBody): { competitorId?: string; sourceId?: string } {
  return {
    competitorId: body.competitorId?.trim(),
    sourceId: body.sourceId?.trim(),
  };
}

/** Add a custom source (type + URL) to an existing competitor. */
export async function POST(request: Request) {
  await connectDb();
  const body = (await request.json()) as {
    competitorId?: string;
    type?: string;
    url?: string;
    selector?: string;
  };
  const competitorId = body.competitorId?.trim();
  const type = body.type?.trim();
  const url = body.url?.trim();
  if (!competitorId || !type || !url) {
    return NextResponse.json(
      { error: "competitorId, type, and url are required." },
      { status: 400 }
    );
  }
  if (!(SOURCE_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: `Unknown source type: ${type}` }, { status: 400 });
  }
  const normalizedUrl = normalizeHttpUrl(url);
  if (!normalizedUrl) {
    return NextResponse.json({ error: "URL must be a valid http(s) address." }, { status: 400 });
  }

  const competitor = await CompetitorModel.findById(competitorId);
  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }
  if (competitor.sources.some((row) => row.type === type && row.url === normalizedUrl)) {
    return NextResponse.json({ error: "This competitor already has that source." }, { status: 409 });
  }

  const sourceType = type as SourceType;
  competitor.sources.push({
    type: sourceType,
    url: normalizedUrl,
    selector: sourceType === "website" ? (body.selector?.trim() || null) : null,
  });
  await competitor.save();
  const added = competitor.sources[competitor.sources.length - 1];

  return NextResponse.json({ ok: true, source: added }, { status: 201 });
}

/** Update a source's CSS selector and/or enabled (pause) flag. */
export async function PATCH(request: Request) {
  await connectDb();
  const body = (await request.json()) as SourcePatchBody;
  const { competitorId, sourceId } = parseIds(body);
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

  const setFields: Record<string, unknown> = {};
  if (typeof body.selector === "string") {
    if (source.type !== "website") {
      return NextResponse.json(
        { error: "CSS selectors only apply to website sources." },
        { status: 400 }
      );
    }
    setFields["sources.$.selector"] = body.selector.trim() || null;
  }
  if (typeof body.enabled === "boolean") {
    setFields["sources.$.enabled"] = body.enabled;
  }
  if (Object.keys(setFields).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await CompetitorModel.updateOne(
    { _id: competitorId, "sources._id": sourceId },
    { $set: setFields }
  );

  return NextResponse.json({ ok: true, sourceId, ...setFields });
}

/** Remove a source from a competitor. */
export async function DELETE(request: Request) {
  await connectDb();
  const { searchParams } = new URL(request.url);
  const competitorId = searchParams.get("competitorId")?.trim();
  const sourceId = searchParams.get("sourceId")?.trim();
  if (!competitorId || !sourceId) {
    return NextResponse.json(
      { error: "competitorId and sourceId are required." },
      { status: 400 }
    );
  }

  const competitor = await CompetitorModel.findById(competitorId);
  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }
  const existed = competitor.sources.some((row) => row._id && row._id.toString() === sourceId);
  if (!existed) {
    return NextResponse.json({ error: "Source not found on this competitor." }, { status: 404 });
  }

  competitor.sources = competitor.sources.filter(
    (row) => !(row._id && row._id.toString() === sourceId)
  );
  await competitor.save();

  return NextResponse.json({ ok: true, sourceId });
}
