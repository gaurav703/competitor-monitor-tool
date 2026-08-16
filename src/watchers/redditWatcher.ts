import { watchedFromRssXml } from "./blogRssWatcher";
import type { WatchedContent } from "./types";

const FETCH_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 4;
const MIN_GAP_MS = 2000;
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

let lastRedditAt = 0;

export function redditSearchRssUrl(competitorName: string): string {
  const query = `"${competitorName.trim()}"`;
  return `https://www.reddit.com/search.rss?q=${encodeURIComponent(query)}&sort=new`;
}

function toOldReddit(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = "old.reddit.com";
  return parsed.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 30000);
    }
  }
  return Math.min(2000 * 2 ** attempt, 16000);
}

async function paceReddit(): Promise<void> {
  const wait = lastRedditAt + MIN_GAP_MS - Date.now();
  if (wait > 0) {
    await sleep(wait);
  }
  lastRedditAt = Date.now();
}

async function fetchRedditXml(url: string): Promise<string> {
  let lastError = `Reddit RSS fetch failed for ${url}`;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await paceReddit();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: BROWSER_HEADERS,
      });
      if (response.status === 429 || response.status === 503) {
        lastError = `Reddit RSS fetch failed (${response.status})`;
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(retryDelayMs(response, attempt));
          continue;
        }
        throw new Error(lastError);
      }
      if (!response.ok) {
        throw new Error(`Reddit RSS fetch failed (${response.status})`);
      }
      return await response.text();
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith("Reddit RSS fetch failed")) {
        throw error;
      }
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(retryDelayMs(new Response(null, { status: 503 }), attempt));
        continue;
      }
      throw new Error(lastError);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastError);
}

export async function fetchReddit(url: string): Promise<WatchedContent> {
  let primary = url;
  let fallback: string | null = null;
  try {
    primary = toOldReddit(url);
    if (primary !== url) {
      fallback = url;
    }
  } catch {
    primary = url;
  }

  try {
    const xml = await fetchRedditXml(primary);
    return await watchedFromRssXml(xml, url, "reddit", "redditWatcher");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (fallback && !/failed \(429\)|failed \(503\)/.test(message)) {
      const xml = await fetchRedditXml(fallback);
      return await watchedFromRssXml(xml, url, "reddit", "redditWatcher");
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}
