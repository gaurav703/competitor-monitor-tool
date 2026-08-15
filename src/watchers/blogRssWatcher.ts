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

export async function fetchBlogRss(url: string): Promise<WatchedContent> {
  const feed = await parser.parseURL(url);
  const items = (feed.items ?? []).slice(0, MAX_ITEMS);
  const itemLines = items.map((item, index) => {
    const date = item.isoDate ?? item.pubDate ?? "";
    const title = item.title ?? "";
    const snippet = item.contentSnippet ?? item.content ?? "";
    return `${index}:${date}|${title}|${snippet}`;
  });

  const canonicalText = normalizeWhitespace(
    ["feed:" + (feed.title ?? ""), "link:" + (feed.link ?? ""), ...itemLines].join("\n")
  );

  return {
    sourceType: "blog_rss" as SourceType,
    url,
    canonicalText,
    meta: {
      watcher: "blogRssWatcher",
      feedTitle: feed.title,
      feedLink: feed.link,
      itemCount: items.length,
      latestTitle: items[0]?.title,
      latestDate: items[0]?.isoDate ?? items[0]?.pubDate,
    },
  };
}
