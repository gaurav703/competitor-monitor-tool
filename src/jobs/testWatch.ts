import { connectDb, disconnectDb } from "../config/db";
import { UserProductModel } from "../models";
import { runWatchForUserProduct } from "../services/diffService";

function preview(text: string | undefined, max = 180): string {
  if (!text) {
    return "";
  }
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

async function resolveUserProductId(argId: string | undefined): Promise<{ id: string; name: string }> {
  if (argId) {
    const product = await UserProductModel.findById(argId).lean();
    if (!product) {
      throw new Error(`UserProduct not found: ${argId}`);
    }
    return { id: product._id.toString(), name: product.name };
  }

  const fromEnv = process.env.USER_PRODUCT_ID;
  if (fromEnv) {
    const product = await UserProductModel.findById(fromEnv).lean();
    if (!product) {
      throw new Error(`UserProduct not found (USER_PRODUCT_ID): ${fromEnv}`);
    }
    return { id: product._id.toString(), name: product.name };
  }

  const products = await UserProductModel.find().sort({ createdAt: -1 }).lean();
  if (products.length === 0) {
    throw new Error("No UserProduct found. Run npm run add-competitor first.");
  }

  if (products.length > 1) {
    console.log("Multiple UserProducts found; using the most recent. Pass an id to pin one:");
    for (const product of products) {
      console.log(`  ${product._id.toString()}  ${product.name}`);
    }
    console.log("Usage: npm run test-watch -- <userProductId>\n");
  }

  const selected = products[0]!;
  return { id: selected._id.toString(), name: selected.name };
}

async function main(): Promise<void> {
  await connectDb();
  const argId = process.argv[2];
  const product = await resolveUserProductId(argId);

  console.log("Phase 2 testWatch — fetch + hash only (no Gemini, no email)");
  console.log(`UserProduct: ${product.name} (${product.id})\n`);

  const results = await runWatchForUserProduct(product.id, { analyze: false });

  if (results.length === 0) {
    console.log("No competitors/sources for this product. Add some with npm run add-competitor.");
    return;
  }

  let changed = 0;
  let unchanged = 0;
  let failed = 0;

  for (const result of results) {
    if (result.error) {
      failed += 1;
      console.log(`[ERROR] ${result.competitorName}  ${result.sourceType}  ${result.url}`);
      console.log(`        ${result.error}\n`);
      continue;
    }

    if (result.changed) {
      changed += 1;
      const reason = result.isFirstCheck ? "first check (baseline hash)" : "content hash changed";
      console.log(`[CHANGED] ${result.competitorName}  watcher=${result.watcher}  ${result.sourceType}`);
      console.log(`          ${result.url}`);
      console.log(`          ${reason}`);
      console.log(`          previous=${result.previousHash ?? "(none)"}`);
      console.log(`          current =${result.currentHash}`);
      console.log(`          preview: ${preview(result.rawDiff?.content)}\n`);
    } else {
      unchanged += 1;
      console.log(`[UNCHANGED] ${result.competitorName}  watcher=${result.watcher}  ${result.sourceType}`);
      console.log(`            ${result.url}`);
      console.log(`            hash=${result.currentHash}\n`);
    }
  }

  console.log("---");
  console.log(`Sources: ${results.length}  changed: ${changed}  unchanged: ${unchanged}  errors: ${failed}`);
  console.log("Hashes saved on Competitor.sources. No ChangeLogs written in Phase 2.");
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });
