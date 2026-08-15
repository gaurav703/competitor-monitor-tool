import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { UserProductModel } from "@/lib/models";
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
