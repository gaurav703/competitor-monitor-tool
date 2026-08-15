import type { SourceType } from "../models";
import { fetchAppStore } from "./appStoreWatcher";
import { fetchBlogRss } from "./blogRssWatcher";
import { fetchNews } from "./newsWatcher";
import { fetchPlayStore } from "./playStoreWatcher";
import type { WatchedContent } from "./types";
import { fetchWebsite } from "./websiteWatcher";

export async function fetchSource(type: SourceType, url: string, selector?: string): Promise<WatchedContent> {
  switch (type) {
    case "playstore":
      return fetchPlayStore(url);
    case "appstore":
      return fetchAppStore(url);
    case "blog_rss":
      return fetchBlogRss(url);
    case "news":
      return fetchNews(url);
    case "website":
      return fetchWebsite(url, selector);
    default: {
      const exhaustive: never = type;
      throw new Error(`Unsupported source type: ${String(exhaustive)}`);
    }
  }
}

export { fetchAppStore } from "./appStoreWatcher";
export { fetchBlogRss } from "./blogRssWatcher";
export { fetchPlayStore } from "./playStoreWatcher";
export { fetchNews, googleNewsRssUrl } from "./newsWatcher";
export type { WatchedContent } from "./types";
