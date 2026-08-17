import { createHash } from "crypto";
import { Types } from "mongoose";
import { ChangeLogModel, CompetitorModel, UserProductModel } from "../models";
import type { AnalysisStatus, SourceType } from "../models";
import { fetchSource } from "../watchers";
import type { WatchedContent } from "../watchers";
import type { FeedItem } from "../watchers/blogRssWatcher";
import { googleNewsRssUrl } from "../watchers/newsWatcher";
import { redditSearchRssUrl } from "../watchers/redditWatcher";
import { AnalysisError } from "./geminiClient";
import { analyzeChange } from "./aiAnalysisService";
import type { ChangeAnalysis, UserProductContext } from "./aiAnalysisService";
import { titlesFromRawDiff, titlesMatch } from "./dedupe";

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
  /**
   * Save non-baseline diffs as pending ChangeLogs without calling Gemini.
   * Use on short HTTP cron so fetch/hash still finish if analysis is cut off.
   */
  deferAnalysis?: boolean;
  /** Max concurrent source fetches. Only used when `deferAnalysis` is true. */
  fetchConcurrency?: number;
};

const DEFAULT_DEFER_FETCH_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index] as T);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

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
  /** True when feed items were skipped because they duplicate a recent change. */
  deduped: boolean;
  /** True when the source was skipped because it is disabled (paused). */
  skipped: boolean;
};

function emptyAnalysisFields(): Pick<DiffCheckResult, "analyzed" | "changeLogId" | "isMeaningful"> {
  return { analyzed: false, changeLogId: null, isMeaningful: null };
}

/** Cap on how many seen feed item keys we remember per source (drops oldest first). */
const MAX_SEEN_FEED_KEYS = 500;

/** How far back to look for the same story already analyzed for a competitor. */
const DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Normalized titles of feed items already analyzed for this competitor. */
async function recentChangeLogTitles(competitorId: Types.ObjectId): Promise<string[]> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const logs = await ChangeLogModel.find({ competitorId, detectedAt: { $gte: since } })
    .select("rawDiff")
    .lean();
  const titles: string[] = [];
  for (const log of logs) {
    titles.push(...titlesFromRawDiff(log.rawDiff));
  }
  return titles;
}

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
  analysisStatus?: AnalysisStatus;
  analysisAttempts?: number;
  analysisError?: string | null;
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
    analysisStatus: params.analysisStatus ?? "analyzed",
    analysisAttempts: params.analysisAttempts ?? 0,
    analysisError: params.analysisError ?? null,
  });
  return doc._id.toString();
}

export async function checkSource(params: {
  competitorId: Types.ObjectId;
  competitorName: string;
  sourceId: Types.ObjectId;
  sourceType: SourceType;
  url: string;
  selector?: string | null;
  lastCheckedHash: string | null;
  lastSeenItemKeys?: string[];
  userProduct?: UserProductContext;
  analyze?: boolean;
  deferAnalysis?: boolean;
}): Promise<DiffCheckResult> {
  const analyze = params.analyze ?? false;
  const deferAnalysis = params.deferAnalysis ?? false;
  const wantsAnalysis = analyze || deferAnalysis;
  const base = {
    competitorId: params.competitorId.toString(),
    competitorName: params.competitorName,
    sourceId: params.sourceId.toString(),
    sourceType: params.sourceType,
    url: params.url,
  };

  try {
    const watched: WatchedContent = await fetchSource(
      params.sourceType,
      params.url,
      params.selector ?? undefined
    );
    const fetchedAt = new Date();

    const feedKeys = watched.itemKeys;
    const isFeed = feedKeys !== undefined;

    let currentHash: string;
    let isFirstCheck: boolean;
    let changed: boolean;
    let diffContent: string;
    let storedKeysNext: string[] | undefined;
    let deduped = false;
    let feedAnalysisItems: FeedItem[] = [];
    let rawDiffMeta: Record<string, unknown> = watched.meta;

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

      feedAnalysisItems = feedDiff.newItems;
      if (wantsAnalysis && !isFirstCheck && feedAnalysisItems.length > 0) {
        try {
          const recent = await recentChangeLogTitles(params.competitorId);
          const fresh = feedAnalysisItems.filter(
            (item) => !recent.some((existing) => titlesMatch(existing, item.title))
          );
          deduped = feedAnalysisItems.length > fresh.length;
          feedAnalysisItems = fresh;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`Dedupe check skipped for ${params.competitorName}: ${message}`);
        }
      }
      diffContent = feedItemLines(feedAnalysisItems);
      // Persist only the analyzed items so future dedupe compares against the
      // items that were actually analyzed, not the whole feed.
      rawDiffMeta = { ...watched.meta, items: feedAnalysisItems };
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
          meta: rawDiffMeta,
        }
      : null;

    let analyzed = false;
    let changeLogId: string | null = null;
    let isMeaningful: boolean | null = null;

    const shouldAnalyze =
      wantsAnalysis &&
      changed &&
      !isFirstCheck &&
      rawDiff &&
      params.userProduct &&
      (feedKeys === undefined || feedAnalysisItems.length > 0);
    if (shouldAnalyze && rawDiff && params.userProduct) {
      let analysis: ChangeAnalysis;
      let analysisStatus: AnalysisStatus = "analyzed";
      let analysisError: string | null = null;
      if (deferAnalysis) {
        analysis = {
          isMeaningful: false,
          aiSummary: null,
          relevantArea: null,
          urgency: null,
        };
        analysisStatus = "pending";
      } else {
        try {
          analysis = await analyzeChange(
            params.userProduct,
            params.competitorName,
            params.sourceType,
            rawDiff
          );
        } catch (error: unknown) {
          if (error instanceof AnalysisError && error.retryable) {
            // All Gemini models quota-limited. Save the rawDiff now as
            // "pending" so analyzePending can retry without re-fetching.
            console.warn(
              `Analysis deferred (all Gemini models exhausted) for ${params.competitorName} ${params.sourceType}; saved as pending.`
            );
            analysis = {
              isMeaningful: false,
              aiSummary: null,
              relevantArea: null,
              urgency: null,
            };
            analysisStatus = "pending";
            analysisError = error.message;
          } else {
            throw error;
          }
        }
      }
      if (analysisStatus === "analyzed") {
        analyzed = true;
        isMeaningful = analysis.isMeaningful;
      }
      changeLogId = await persistChangeLog({
        competitorId: params.competitorId,
        sourceType: params.sourceType,
        rawDiff,
        analysis,
        analysisStatus,
        analysisAttempts: analysisStatus === "pending" ? (deferAnalysis ? 0 : 1) : 0,
        analysisError,
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
      deduped,
      skipped: false,
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
      deduped: false,
      skipped: false,
    };
  }
}

export async function runWatchForUserProduct(
  userProductId: string,
  options: WatchOptions = {}
): Promise<DiffCheckResult[]> {
  const analyze = options.analyze ?? false;
  const deferAnalysis = options.deferAnalysis ?? false;
  const fetchConcurrency = deferAnalysis
    ? Math.max(1, options.fetchConcurrency ?? DEFAULT_DEFER_FETCH_CONCURRENCY)
    : 1;

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
    const hasReddit = competitor.sources.some((source) => source.type === "reddit");
    if (!hasReddit) {
      competitor.sources.push({
        type: "reddit",
        url: redditSearchRssUrl(competitor.name),
      });
      await competitor.save();
      console.log(`Added Reddit search source for ${competitor.name}`);
    }
  }

  type WorkItem =
    | { kind: "ready"; result: DiffCheckResult }
    | {
        kind: "check";
        params: Parameters<typeof checkSource>[0];
      };

  const work: WorkItem[] = [];

  for (const competitor of competitors) {
    for (const source of competitor.sources) {
      if (source.enabled === false) {
        work.push({
          kind: "ready",
          result: {
            competitorId: competitor._id.toString(),
            competitorName: competitor.name,
            sourceId: source._id?.toString() ?? "",
            sourceType: source.type as SourceType,
            url: source.url,
            watcher: source.type,
            changed: false,
            isFirstCheck: false,
            previousHash: source.lastCheckedHash ?? null,
            currentHash: null,
            rawDiff: null,
            error: null,
            ...emptyAnalysisFields(),
            deduped: false,
            skipped: true,
          },
        });
        continue;
      }

      if (!source._id) {
        work.push({
          kind: "ready",
          result: {
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
            deduped: false,
            skipped: false,
          },
        });
        continue;
      }

      work.push({
        kind: "check",
        params: {
          competitorId: competitor._id,
          competitorName: competitor.name,
          sourceId: source._id as Types.ObjectId,
          sourceType: source.type as SourceType,
          url: source.url,
          selector: source.selector ?? null,
          lastCheckedHash: source.lastCheckedHash ?? null,
          lastSeenItemKeys: source.lastSeenItemKeys ?? [],
          userProduct,
          analyze,
          deferAnalysis,
        },
      });
    }
  }

  const checks = work.filter(
    (item): item is Extract<WorkItem, { kind: "check" }> => item.kind === "check"
  );
  const checkResults = await mapWithConcurrency(checks, fetchConcurrency, (item) =>
    checkSource(item.params)
  );

  let checkIndex = 0;
  return work.map((item) => {
    if (item.kind === "ready") {
      return item.result;
    }
    const result = checkResults[checkIndex];
    checkIndex += 1;
    if (!result) {
      throw new Error("Internal error: missing checkSource result.");
    }
    return result;
  });
}

export async function runWatchPipeline(options: WatchOptions = {}): Promise<DiffCheckResult[]> {
  const products = await UserProductModel.find().lean();
  const all: DiffCheckResult[] = [];
  for (const product of products) {
    const results = await runWatchForUserProduct(product._id.toString(), {
      analyze: options.analyze ?? true,
      deferAnalysis: options.deferAnalysis,
      fetchConcurrency: options.fetchConcurrency,
    });
    all.push(...results);
  }
  return all;
}
