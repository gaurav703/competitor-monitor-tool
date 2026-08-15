import { createHash } from "crypto";
import { Types } from "mongoose";
import { ChangeLogModel, CompetitorModel, UserProductModel } from "../models";
import type { SourceType } from "../models";
import { fetchSource } from "../watchers";
import type { WatchedContent } from "../watchers";
import { googleNewsRssUrl } from "../watchers/newsWatcher";
import { analyzeChange } from "./aiAnalysisService";
import type { ChangeAnalysis, UserProductContext } from "./aiAnalysisService";

export type RawDiff = {
  sourceType: SourceType;
  url: string;
  isFirstCheck: boolean;
  previousHash: string | null;
  currentHash: string;
  fetchedAt: string;
  content: string;
  meta: Record<string, unknown>;
};

export type WatchOptions = {
  /** When true (default for the live pipeline), Gemini runs on non-baseline diffs and ChangeLogs are saved. */
  analyze?: boolean;
};

export type DiffCheckResult = {
  competitorId: string;
  competitorName: string;
  sourceId: string;
  sourceType: SourceType;
  url: string;
  watcher: string;
  changed: boolean;
  isFirstCheck: boolean;
  previousHash: string | null;
  currentHash: string | null;
  rawDiff: RawDiff | null;
  error: string | null;
  analyzed: boolean;
  changeLogId: string | null;
  isMeaningful: boolean | null;
};

function emptyAnalysisFields(): Pick<DiffCheckResult, "analyzed" | "changeLogId" | "isMeaningful"> {
  return { analyzed: false, changeLogId: null, isMeaningful: null };
}

export function hashContent(canonicalText: string): string {
  return createHash("sha256").update(canonicalText, "utf8").digest("hex");
}

async function persistChangeLog(params: {
  competitorId: Types.ObjectId;
  sourceType: SourceType;
  rawDiff: RawDiff;
  analysis: ChangeAnalysis;
}): Promise<string> {
  const doc = await ChangeLogModel.create({
    competitorId: params.competitorId,
    sourceType: params.sourceType,
    rawDiff: params.rawDiff,
    aiSummary: params.analysis.aiSummary,
    relevantArea: params.analysis.relevantArea,
    urgency: params.analysis.urgency,
    isMeaningful: params.analysis.isMeaningful,
    detectedAt: new Date(),
    notified: false,
  });
  return doc._id.toString();
}

export async function checkSource(params: {
  competitorId: Types.ObjectId;
  competitorName: string;
  sourceId: Types.ObjectId;
  sourceType: SourceType;
  url: string;
  lastCheckedHash: string | null;
  userProduct?: UserProductContext;
  analyze?: boolean;
}): Promise<DiffCheckResult> {
  const analyze = params.analyze ?? false;
  const base = {
    competitorId: params.competitorId.toString(),
    competitorName: params.competitorName,
    sourceId: params.sourceId.toString(),
    sourceType: params.sourceType,
    url: params.url,
  };

  try {
    const watched: WatchedContent = await fetchSource(params.sourceType, params.url);
    const currentHash = hashContent(watched.canonicalText);
    const previousHash = params.lastCheckedHash;
    const isFirstCheck = !previousHash;
    const changed = isFirstCheck || previousHash !== currentHash;
    const fetchedAt = new Date();

    await CompetitorModel.updateOne(
      { _id: params.competitorId, "sources._id": params.sourceId },
      {
        $set: {
          "sources.$.lastCheckedHash": currentHash,
          "sources.$.lastCheckedAt": fetchedAt,
        },
      }
    );

    const rawDiff: RawDiff | null = changed
      ? {
          sourceType: params.sourceType,
          url: params.url,
          isFirstCheck,
          previousHash,
          currentHash,
          fetchedAt: fetchedAt.toISOString(),
          content: watched.canonicalText,
          meta: watched.meta,
        }
      : null;

    let analyzed = false;
    let changeLogId: string | null = null;
    let isMeaningful: boolean | null = null;

    const shouldAnalyze = analyze && changed && !isFirstCheck && rawDiff && params.userProduct;
    if (shouldAnalyze && rawDiff && params.userProduct) {
      const analysis = await analyzeChange(
        params.userProduct,
        params.competitorName,
        params.sourceType,
        rawDiff
      );
      analyzed = true;
      isMeaningful = analysis.isMeaningful;
      changeLogId = await persistChangeLog({
        competitorId: params.competitorId,
        sourceType: params.sourceType,
        rawDiff,
        analysis,
      });
    }

    return {
      ...base,
      watcher: String(watched.meta.watcher ?? params.sourceType),
      changed,
      isFirstCheck,
      previousHash,
      currentHash,
      rawDiff,
      error: null,
      analyzed,
      changeLogId,
      isMeaningful,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      watcher: params.sourceType,
      changed: false,
      isFirstCheck: !params.lastCheckedHash,
      previousHash: params.lastCheckedHash,
      currentHash: null,
      rawDiff: null,
      error: message,
      ...emptyAnalysisFields(),
    };
  }
}

export async function runWatchForUserProduct(
  userProductId: string,
  options: WatchOptions = {}
): Promise<DiffCheckResult[]> {
  const analyze = options.analyze ?? false;

  if (!Types.ObjectId.isValid(userProductId)) {
    throw new Error(`Invalid UserProduct id: ${userProductId}`);
  }

  const product = await UserProductModel.findById(userProductId).lean();
  if (!product) {
    throw new Error(`UserProduct not found: ${userProductId}`);
  }

  const userProduct: UserProductContext = {
    name: product.name,
    industry: product.industry,
    description: product.description,
  };

  const competitors = await CompetitorModel.find({ userProductId: product._id });
  for (const competitor of competitors) {
    const hasNews = competitor.sources.some((source) => source.type === "news");
    if (!hasNews) {
      competitor.sources.push({
        type: "news",
        url: googleNewsRssUrl(competitor.name),
      });
      await competitor.save();
      console.log(`Added Google News source for ${competitor.name}`);
    }
  }

  const results: DiffCheckResult[] = [];

  for (const competitor of competitors) {
    for (const source of competitor.sources) {
      if (!source._id) {
        results.push({
          competitorId: competitor._id.toString(),
          competitorName: competitor.name,
          sourceId: "",
          sourceType: source.type as SourceType,
          url: source.url,
          watcher: source.type,
          changed: false,
          isFirstCheck: true,
          previousHash: source.lastCheckedHash ?? null,
          currentHash: null,
          rawDiff: null,
          error: "Source is missing _id; cannot update hash.",
          ...emptyAnalysisFields(),
        });
        continue;
      }

      const result = await checkSource({
        competitorId: competitor._id,
        competitorName: competitor.name,
        sourceId: source._id as Types.ObjectId,
        sourceType: source.type as SourceType,
        url: source.url,
        lastCheckedHash: source.lastCheckedHash ?? null,
        userProduct,
        analyze,
      });
      results.push(result);
    }
  }

  return results;
}

export async function runWatchPipeline(): Promise<DiffCheckResult[]> {
  const products = await UserProductModel.find().lean();
  const all: DiffCheckResult[] = [];
  for (const product of products) {
    const results = await runWatchForUserProduct(product._id.toString(), { analyze: true });
    all.push(...results);
  }
  return all;
}
