import { watchedFromRssXml } from "./blogRssWatcher";
import type { WatchedContent } from "./types";

const REDDIT_USER_AGENT = "competitor-monitor/0.1 (competitor watch; +https://localhost)";
const FETCH_TIMEOUT_MS = 15000;

export function redditSearchRssUrl(competitorName: string): string {
  const query = `"${competitorName.trim()}"`;
  return `https://www.reddit.com/search.rss?q=${encodeURIComponent(query)}&sort=new`;
}

function toOldReddit(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = "old.reddit.com";
  return parsed.toString();
}

async function fetchRedditXml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": REDDIT_USER_AGENT,
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!response.ok) {
      throw new Error(`Reddit RSS fetch failed (${response.status})`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchReddit(url: string): Promise<WatchedContent> {
  const candidates = [url];
  try {
    const oldUrl = toOldReddit(url);
    if (oldUrl !== url) {
      candidates.push(oldUrl);
    }
  } catch {
    // keep the original URL only
  }

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const xml = await fetchRedditXml(candidate);
      return await watchedFromRssXml(xml, url, "reddit", "redditWatcher");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
