import { createHash } from "crypto";
import { Types } from "mongoose";
import { ChangeLogModel, CompetitorModel, UserProductModel } from "../models";
import type { SourceType } from "../models";
import { fetchSource } from "../watchers";
import type { WatchedContent } from "../watchers";
import type { FeedItem } from "../watchers/blogRssWatcher";
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

/** Cap on how many seen feed item keys we remember per source (drops oldest first). */
const MAX_SEEN_FEED_KEYS = 500;

export function hashContent(canonicalText: string): string {
  return createHash("sha256").update(canonicalText, "utf8").digest("hex");
}

/**
 * Order-independent hash of a set of feed item keys. Two fetches with the same
 * items in a different order produce the same hash, so reshuffles and headline
 * rotation never look like a change.
 */
export function hashFeedKeys(keys: string[]): string {
  const unique = [...new Set(keys)].sort();
  return createHash("sha256").update(unique.join("\n"), "utf8").digest("hex");
}

/** Focused analysis content: only the items that are genuinely new. */
function feedItemLines(items: FeedItem[]): string {
  return items
    .map((item) => {
      const title = item.title ? `title: ${item.title}\n` : "";
      const date = item.date ? `date: ${item.date}\n` : "";
      const link = item.link ? `(source: ${item.link})` : "";
      return `${title}${date}${item.snippet}${link}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

export type FeedDiffResult = {
  /** Hash of the next seen-key set (order-independent). */
  currentHash: string;
  /** The seen-key set to persist on the source. */
  nextSeenKeys: string[];
  isFirstCheck: boolean;
  changed: boolean;
  /** Keys present now but never seen before. */
  newKeys: string[];
  /** Items matching newKeys — what Gemini should actually look at. */
  newItems: FeedItem[];
};

/**
 * Order-independent change detection for feed sources.
 * A reshuffle or headline rotation of already-seen items never counts as a
 * change; only keys that have never been seen before trigger one.
 */
export function diffFeedItems(params: {
  previousHash: string | null;
  storedKeys: string[];
  currentKeys: string[];
  items: FeedItem[];
}): FeedDiffResult {
  const current = [...new Set(params.currentKeys)];
  const currentSet = new Set(current);
  const storedSet = new Set(params.storedKeys);
  const newKeys = current.filter((key) => !storedSet.has(key));
  // Order: every current feed key first (so a reshuffle or rotation never
  // re-triggers them), then remaining history. The cap only evicts from the
  // history tail, never a key that is in the feed right now.
  const history = params.storedKeys.filter((key) => !currentSet.has(key));
  const nextSeenKeys =
    current.length >= MAX_SEEN_FEED_KEYS
      ? current.slice(0, MAX_SEEN_FEED_KEYS)
      : [...current, ...history].slice(0, MAX_SEEN_FEED_KEYS);
  const currentHash = hashFeedKeys(nextSeenKeys);
  // No stored keys yet (fresh source, or a pre-migration hash format) = baseline.
  const isFirstCheck = params.storedKeys.length === 0;
  const changed = isFirstCheck || params.previousHash !== currentHash;
  const newItems =
    newKeys.length > 0
      ? params.items.filter((item) => newKeys.includes(item.key))
      : isFirstCheck
        ? params.items
        : [];
  return { currentHash, nextSeenKeys, isFirstCheck, changed, newKeys, newItems };
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
  lastSeenItemKeys?: string[];
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
    const fetchedAt = new Date();

    const feedKeys = watched.itemKeys;
    const isFeed = feedKeys !== undefined;

    let currentHash: string;
    let isFirstCheck: boolean;
    let changed: boolean;
    let diffContent: string;
    let storedKeysNext: string[] | undefined;

    if (feedKeys !== undefined) {
      const items = (watched.meta.items as FeedItem[] | undefined) ?? [];
      const feedDiff = diffFeedItems({
        previousHash: params.lastCheckedHash,
        storedKeys: params.lastSeenItemKeys ?? [],
        currentKeys: feedKeys,
        items,
      });
      currentHash = feedDiff.currentHash;
      storedKeysNext = feedDiff.nextSeenKeys;
      isFirstCheck = feedDiff.isFirstCheck;
      changed = feedDiff.changed;
      diffContent = feedItemLines(feedDiff.newItems);
    } else {
      currentHash = hashContent(watched.canonicalText);
      isFirstCheck = !params.lastCheckedHash;
      changed = isFirstCheck || params.lastCheckedHash !== currentHash;
      diffContent = watched.canonicalText;
    }

    const previousHash = params.lastCheckedHash;

    const setFields: Record<string, unknown> = {
      "sources.$.lastCheckedHash": currentHash,
      "sources.$.lastCheckedAt": fetchedAt,
    };
    if (isFeed && storedKeysNext) {
      setFields["sources.$.lastSeenItemKeys"] = storedKeysNext;
    }

    await CompetitorModel.updateOne(
      { _id: params.competitorId, "sources._id": params.sourceId },
      { $set: setFields }
    );

    const rawDiff: RawDiff | null = changed
      ? {
          sourceType: params.sourceType,
          url: params.url,
          isFirstCheck,
          previousHash,
          currentHash,
          fetchedAt: fetchedAt.toISOString(),
          content: diffContent,
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
        lastSeenItemKeys: source.lastSeenItemKeys ?? [],
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
