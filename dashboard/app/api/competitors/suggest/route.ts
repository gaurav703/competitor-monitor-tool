import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { CompetitorModel, UserProductModel } from "@/lib/models";
import { suggestCompetitorsForProduct } from "../../../../../src/services/suggestCompetitors";

export async function GET(request: Request) {
  await connectDb();
  const { searchParams } = new URL(request.url);
  const userProductId = searchParams.get("userProductId")?.trim();
  if (!userProductId) {
    return NextResponse.json({ error: "userProductId is required." }, { status: 400 });
  }

  const product = await UserProductModel.findById(userProductId).lean();
  if (!product) {
    return NextResponse.json({ error: "UserProduct not found." }, { status: 404 });
  }

  const existing = await CompetitorModel.find({ userProductId }).select("name").lean();
  try {
    const suggestions = await suggestCompetitorsForProduct(
      {
        name: product.name,
        industry: product.industry,
        description: product.description,
      },
      existing.map((row) => row.name)
    );
    return NextResponse.json({ suggestions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message, suggestions: [] }, { status: 502 });
  }
}
