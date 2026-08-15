import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { CompetitorModel, UserProductModel } from "@/lib/models";
import { suggestCompetitorsForProduct } from "../../../../../src/services/suggestCompetitors";

type Suggestion = { name: string; why: string };

export async function GET(request: Request) {
  await connectDb();
  const { searchParams } = new URL(request.url);
  const userProductId = searchParams.get("userProductId")?.trim();
  const refresh = searchParams.get("refresh") === "1";
  if (!userProductId) {
    return NextResponse.json({ error: "userProductId is required." }, { status: 400 });
  }

  const product = await UserProductModel.findById(userProductId).lean();
  if (!product) {
    return NextResponse.json({ error: "UserProduct not found." }, { status: 404 });
  }

  const existing = await CompetitorModel.find({ userProductId }).select("name").lean();
  const watching = new Set(existing.map((row) => row.name.toLowerCase()));

  // Saved suggestions, minus any that are now being watched.
  const cached = (product.suggestedCompetitors ?? []).filter(
    (row) => !watching.has(row.name.toLowerCase())
  );

  // Default path: serve the cache so reopening the form costs no Gemini call.
  if (!refresh && cached.length > 0) {
    return NextResponse.json({
      suggestions: cached,
      fromCache: true,
      suggestedAt: product.suggestedAt ?? null,
    });
  }

  const productContext = {
    name: product.name,
    industry: product.industry,
    description: product.description,
  };

  try {
    const suggestions = await suggestCompetitorsForProduct(
      productContext,
      existing.map((row) => row.name)
    );
    if (suggestions.length > 0) {
      await UserProductModel.updateOne(
        { _id: product._id },
        { $set: { suggestedCompetitors: suggestions, suggestedAt: new Date() } }
      );
    }
    return NextResponse.json({ suggestions, fromCache: false, suggestedAt: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // A failed manual refresh should keep showing the saved list.
    if (cached.length > 0) {
      return NextResponse.json({ suggestions: cached, fromCache: true, error: message });
    }
    return NextResponse.json({ error: message, suggestions: [] }, { status: 502 });
  }
}
