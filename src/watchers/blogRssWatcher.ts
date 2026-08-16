import Parser from "rss-parser";
import type { SourceType } from "../models";
import { normalizeWhitespace } from "./parseSource";
import type { WatchedContent } from "./types";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "competitor-monitor/0.1 (+https://localhost)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
  },
});

const MAX_ITEMS = 15;

export type FeedItem = {
  /** Stable identity for this item: feed GUID, else link, else title. */
  key: string;
  date: string;
  title: string;
  snippet: string;
  link: string;
};

function itemKey(item: { guid?: string; link?: string; title?: string }): string {
  const raw = item.guid?.trim() || item.link?.trim() || item.title?.trim() || "";
  return normalizeWhitespace(raw);
}

function dateMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

type ParsedRssItem = {
  guid?: string;
  link?: string;
  title?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
};

type ParsedRss = {
  title?: string;
  link?: string;
  items?: ParsedRssItem[];
};

export function watchedFromParsedRss(
  feed: ParsedRss,
  url: string,
  sourceType: SourceType,
  watcher: string
): WatchedContent {
  const items = (feed.items ?? []).slice(0, MAX_ITEMS);

  const seen = new Set<string>();
  const unique: FeedItem[] = [];
  for (const item of items) {
    const key = itemKey(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push({
      key,
      date: item.isoDate ?? item.pubDate ?? "",
      title: item.title ?? "",
      snippet: item.contentSnippet ?? item.content ?? "",
      link: item.link ?? "",
    });
  }

  // Order-independent: sorted by key so a feed reshuffle never changes the
  // canonical text or the change-detection hash.
  const sorted = [...unique].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const itemLines = sorted.map((item) =>
    [item.key, item.date, item.title, item.snippet, item.link ? `link:${item.link}` : ""]
      .filter(Boolean)
      .join("|")
  );

  const canonicalText = normalizeWhitespace(
    ["feed:" + (feed.title ?? ""), "link:" + (feed.link ?? ""), ...itemLines].join("\n")
  );

  const latest = [...sorted].sort((a, b) => dateMs(b.date) - dateMs(a.date))[0];

  return {
    sourceType,
    url,
    canonicalText,
    itemKeys: sorted.map((item) => item.key),
    meta: {
      watcher,
      feedTitle: feed.title,
      feedLink: feed.link,
      itemCount: sorted.length,
      latestTitle: latest?.title,
      latestDate: latest?.date || undefined,
      items: sorted,
    },
  };
}

export async function watchedFromRssXml(
  xml: string,
  url: string,
  sourceType: SourceType,
  watcher: string
): Promise<WatchedContent> {
  const feed = await parser.parseString(xml);
  return watchedFromParsedRss(feed, url, sourceType, watcher);
}

export async function fetchBlogRss(url: string): Promise<WatchedContent> {
  const feed = await parser.parseURL(url);
  return watchedFromParsedRss(feed, url, "blog_rss", "blogRssWatcher");
}
