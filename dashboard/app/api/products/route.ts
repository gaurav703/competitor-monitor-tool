import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { AlertLogModel, ChangeLogModel, CompetitorModel, UserProductModel } from "@/lib/models";
import { sendWelcomeEmailSafe } from "../../../../src/services/onboardingEmail";

export async function GET() {
  await connectDb();
  const products = await UserProductModel.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json(products);
}

export async function POST(request: Request) {
  await connectDb();
  const body = (await request.json()) as {
    name?: string;
    industry?: string;
    description?: string;
    ownerEmail?: string;
  };
  const name = body.name?.trim();
  const industry = body.industry?.trim();
  const description = body.description?.trim();
  const ownerEmail = body.ownerEmail?.trim();
  if (!name || !industry || !description || !ownerEmail) {
    return NextResponse.json({ error: "All product fields are required." }, { status: 400 });
  }
  const product = await UserProductModel.create({ name, industry, description, ownerEmail });
  await sendWelcomeEmailSafe({ name: product.name, ownerEmail: product.ownerEmail });
  return NextResponse.json(product, { status: 201 });
}

export async function PATCH(request: Request) {
  await connectDb();
  const body = (await request.json()) as {
    id?: string;
    name?: string;
    industry?: string;
    description?: string;
    ownerEmail?: string;
  };
  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  const product = await UserProductModel.findById(id);
  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  let productEdited = false;
  if (typeof body.name === "string" && body.name.trim()) {
    update.name = body.name.trim();
    productEdited = true;
  }
  if (typeof body.industry === "string" && body.industry.trim()) {
    update.industry = body.industry.trim();
    productEdited = true;
  }
  if (typeof body.description === "string" && body.description.trim()) {
    update.description = body.description.trim();
    productEdited = true;
  }
  if (typeof body.ownerEmail === "string" && body.ownerEmail.trim()) {
    update.ownerEmail = body.ownerEmail.trim();
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }
  if (productEdited) {
    // Suggestions depend on the product profile; drop them so the next
    // form visit regenerates instead of serving stale picks.
    update.suggestedCompetitors = [];
    update.suggestedAt = null;
  }

  const updated = await UserProductModel.findByIdAndUpdate(id, { $set: update }, { new: true });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  await connectDb();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  const product = await UserProductModel.findById(id);
  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const competitors = await CompetitorModel.find({ userProductId: id }).select("_id").lean();
  const competitorIds = competitors.map((row) => row._id);
  const logs = await ChangeLogModel.find({ competitorId: { $in: competitorIds } })
    .select("_id")
    .lean();
  const logIds = logs.map((row) => row._id);
  await AlertLogModel.deleteMany({ changeLogId: { $in: logIds } });
  await ChangeLogModel.deleteMany({ competitorId: { $in: competitorIds } });
  await CompetitorModel.deleteMany({ userProductId: id });
  await UserProductModel.findByIdAndDelete(id);

  return NextResponse.json({ ok: true, deleted: { id, competitors: competitorIds.length, logs: logIds.length } });
}

export const dynamic = "force-dynamic";
