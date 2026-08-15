import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { AlertLogModel, ChangeLogModel, CompetitorModel, UserProductModel } from "@/lib/models";
import { discoverSourcesForName } from "../../../../src/services/discoverSources";
import {
  emailedUpdatesPayload,
  resolveLastTwoUpdates,
  sendCompetitorsAddedEmailSafe,
  type CompetitorEmail,
  type PreviewUpdate,
} from "../../../../src/services/onboardingEmail";

function parseCompetitorNames(raw: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of raw.split(/[,;\n]+/)) {
    const name = part.trim();
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return names;
}

export async function POST(request: Request) {
  await connectDb();
  const body = (await request.json()) as {
    userProductId?: string;
    name?: string;
    names?: string[];
  };

  const userProductId = body.userProductId?.trim();
  const names = [
    ...parseCompetitorNames(body.name ?? ""),
    ...(body.names ?? []).map((value) => value.trim()).filter(Boolean),
  ].filter((name, index, all) => all.findIndex((row) => row.toLowerCase() === name.toLowerCase()) === index);

  if (!userProductId || names.length === 0) {
    return NextResponse.json({ error: "Competitor name(s) and userProductId are required." }, { status: 400 });
  }

  const product = await UserProductModel.findById(userProductId).lean();
  if (!product) {
    return NextResponse.json({ error: "UserProduct not found." }, { status: 404 });
  }

  const existing = await CompetitorModel.find({ userProductId }).select("name").lean();
  const existingKeys = new Set(existing.map((row) => row.name.toLowerCase()));

  const results: Array<{
    name: string;
    ok: boolean;
    skipped?: boolean;
    error?: string;
    notes: { kind: string; detail: string }[];
  }> = [];

  const createdCompetitors: CompetitorEmail[] = [];

  for (const name of names) {
    if (existingKeys.has(name.toLowerCase())) {
      results.push({
        name,
        ok: false,
        skipped: true,
        error: "Already watching this competitor for this product.",
        notes: [],
      });
      continue;
    }

    const discovery = await discoverSourcesForName(name);
    if (discovery.sources.length === 0) {
      results.push({
        name,
        ok: false,
        error: `Could not find Play Store, App Store, website, or RSS for "${name}".`,
        notes: discovery.notes,
      });
      continue;
    }

    const competitor = await CompetitorModel.create({
      userProductId,
      name,
      sources: discovery.sources,
    });
    createdCompetitors.push({
      _id: competitor._id,
      name: competitor.name,
      sources: competitor.sources,
    });
    existingKeys.add(name.toLowerCase());
    results.push({ name, ok: true, notes: discovery.notes });
  }

  const created = results.filter((row) => row.ok).length;
  if (created > 0) {
    const logs = await ChangeLogModel.find({
      competitorId: { $in: createdCompetitors.map((row) => row._id) },
      isMeaningful: true,
    })
      .sort({ detectedAt: -1 })
      .lean();
    const nameById = new Map(createdCompetitors.map((row) => [row._id.toString(), row.name]));
    const existingLogs: PreviewUpdate[] = logs.map((log) => {
      const raw = log.rawDiff as { url?: string } | null;
      return {
        competitorName: nameById.get(log.competitorId.toString()) ?? "Unknown competitor",
        sourceType: log.sourceType,
        summary: log.aiSummary ?? "(no summary)",
        sourceUrl: raw?.url ?? "",
        detectedAt: log.detectedAt,
        relevantArea: log.relevantArea,
        urgency: log.urgency,
      };
    });
    const updates = await resolveLastTwoUpdates(createdCompetitors, existingLogs);
    const emailSent = await sendCompetitorsAddedEmailSafe(
      { name: product.name, ownerEmail: product.ownerEmail },
      createdCompetitors,
      updates
    );
    const emailedAt = emailSent ? new Date() : null;
    await Promise.all(
      createdCompetitors.map((competitor) =>
        CompetitorModel.updateOne(
          { _id: competitor._id },
          {
            $set: {
              emailedUpdates: emailedUpdatesPayload(competitor.name, updates, emailSent),
              lastUpdatesEmailSent: emailSent,
              lastUpdatesEmailAt: emailedAt,
            },
          }
        )
      )
    );
  }
  const failed = results.filter((row) => !row.ok && !row.skipped);
  const status = created > 0 ? 201 : failed.length > 0 ? 404 : 409;

  return NextResponse.json(
    {
      created,
      results,
      error:
        created === 0
          ? names.length === 1
            ? results[0]?.error
            : "None of the names could be added. Check the notes below."
          : undefined,
    },
    { status }
  );
}

export async function PATCH(request: Request) {
  await connectDb();
  const body = (await request.json()) as { id?: string; name?: string };
  const id = body.id?.trim();
  const name = body.name?.trim();
  if (!id || !name) {
    return NextResponse.json({ error: "id and name are required." }, { status: 400 });
  }
  const updated = await CompetitorModel.findByIdAndUpdate(id, { $set: { name } }, { new: true });
  if (!updated) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  await connectDb();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  const competitor = await CompetitorModel.findById(id);
  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }

  const logs = await ChangeLogModel.find({ competitorId: id }).select("_id").lean();
  const logIds = logs.map((row) => row._id);
  await AlertLogModel.deleteMany({ changeLogId: { $in: logIds } });
  await ChangeLogModel.deleteMany({ competitorId: id });
  await CompetitorModel.findByIdAndDelete(id);

  return NextResponse.json({ ok: true, deleted: { id, logs: logIds.length } });
}

export const dynamic = "force-dynamic";
