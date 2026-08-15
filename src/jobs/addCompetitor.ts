import readline from "readline";
import { connectDb, disconnectDb } from "../config/db";
import { CompetitorModel, ChangeLogModel, UserProductModel } from "../models";
import { discoverSourcesForName } from "../services/discoverSources";
import {
  emailedUpdatesPayload,
  resolveLastTwoUpdates,
  sendCompetitorsAddedEmailSafe,
  sendWelcomeEmailSafe,
  type PreviewUpdate,
} from "../services/onboardingEmail";

function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
}

async function createUserProduct(rl: readline.Interface) {
  console.log("\n--- Your product (used later so Gemini judges changes vs YOU) ---");
  const name = await ask(rl, "Product name: ");
  const industry = await ask(rl, "Industry (any, e.g. fintech / SaaS / e-commerce): ");
  const description = await ask(rl, "Short description: ");
  const ownerEmail = await ask(rl, "Owner email (daily digest): ");

  if (!name || !industry || !description || !ownerEmail) {
    throw new Error("All product fields are required.");
  }

  const product = await UserProductModel.create({
    name,
    industry,
    description,
    ownerEmail,
  });
  console.log(`Saved UserProduct ${product._id.toString()}`);
  await sendWelcomeEmailSafe({ name: product.name, ownerEmail: product.ownerEmail });
  return product;
}

async function selectOrCreateUserProduct(rl: readline.Interface) {
  const existing = await UserProductModel.find().sort({ createdAt: -1 }).lean();
  if (existing.length === 0) {
    console.log("No products yet. Creating your first UserProduct.");
    return createUserProduct(rl);
  }

  console.log("\nExisting products:");
  existing.forEach((product, index) => {
    console.log(`  ${index + 1}) ${product.name} (${product.industry}) [${product._id.toString()}]`);
  });
  console.log("  n) Create a new product");

  const choice = await ask(rl, "Choose product number or n: ");
  if (choice.toLowerCase() === "n") {
    return createUserProduct(rl);
  }

  const index = Number(choice) - 1;
  const selected = existing[index];
  if (!selected) {
    throw new Error("Invalid product selection.");
  }
  return selected;
}

async function addCompetitor() {
  await connectDb();
  const rl = createInterface();

  try {
    const product = await selectOrCreateUserProduct(rl);

    console.log("\n--- Competitor ---");
    const name = await ask(rl, "Competitor name: ");
    if (!name) {
      throw new Error("Competitor name is required.");
    }

    console.log(`Discovering Play Store / App Store / website / RSS for "${name}"…`);
    const discovery = await discoverSourcesForName(name);
    for (const note of discovery.notes) {
      console.log(`  ${note.kind}: ${note.detail}`);
    }
    if (discovery.sources.length === 0) {
      throw new Error(`Could not find sources for "${name}". Try a more specific product name.`);
    }

    const competitor = await CompetitorModel.create({
      userProductId: product._id,
      name,
      sources: discovery.sources,
    });

    console.log("\nSaved competitor:");
    console.log(`  UserProduct ID: ${product._id.toString()}`);
    console.log(`  Competitor ID:  ${competitor._id.toString()}`);
    console.log(`  Name:           ${competitor.name}`);
    console.log("  Sources:");
    for (const source of competitor.sources) {
      console.log(`    - ${source.type} ${source.url}`);
    }

    const logs = await ChangeLogModel.find({
      competitorId: competitor._id,
      isMeaningful: true,
    })
      .sort({ detectedAt: -1 })
      .limit(2)
      .lean();
    const existingLogs: PreviewUpdate[] = logs.map((log) => {
      const raw = log.rawDiff as { url?: string } | null;
      return {
        competitorName: competitor.name,
        sourceType: log.sourceType,
        summary: log.aiSummary ?? "(no summary)",
        sourceUrl: raw?.url ?? "",
        detectedAt: log.detectedAt,
        relevantArea: log.relevantArea,
      };
    });
    const added = {
      _id: competitor._id,
      name: competitor.name,
      sources: competitor.sources,
    };
    const updates = await resolveLastTwoUpdates([added], existingLogs);
    const emailSent = await sendCompetitorsAddedEmailSafe(
      { name: product.name, ownerEmail: product.ownerEmail },
      [added],
      updates
    );
    await CompetitorModel.updateOne(
      { _id: competitor._id },
      {
        $set: {
          emailedUpdates: emailedUpdatesPayload(competitor.name, updates, emailSent),
          lastUpdatesEmailSent: emailSent,
          lastUpdatesEmailAt: emailSent ? new Date() : null,
        },
      }
    );
  } finally {
    rl.close();
    await disconnectDb();
  }
}

addCompetitor().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed: ${message}`);
  process.exitCode = 1;
});
