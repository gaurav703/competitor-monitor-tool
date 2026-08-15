import type { SourceType } from "../models";
import { fetchBlogRss } from "./blogRssWatcher";
import type { WatchedContent } from "./types";

export function googleNewsRssUrl(competitorName: string): string {
  const query = `"${competitorName.trim()}"`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
}

export async function fetchNews(url: string): Promise<WatchedContent> {
  const watched = await fetchBlogRss(url);
  return {
    ...watched,
    sourceType: "news" as SourceType,
    meta: {
      ...watched.meta,
      watcher: "newsWatcher",
    },
  };
}
