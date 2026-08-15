import * as cheerio from "cheerio";
import type { SourceType } from "../models";
import { normalizeWhitespace } from "./parseSource";
import type { WatchedContent } from "./types";

const FETCH_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 4;
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

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
  return Math.min(1500 * 2 ** attempt, 12000);
}

async function fetchHtml(url: string): Promise<{ html: string; status: number }> {
  let lastError = `Website fetch failed for ${url}`;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: BROWSER_HEADERS,
        redirect: "follow",
      });
      if (response.status === 429 || response.status === 503) {
        lastError = `Website fetch failed (${response.status} ${response.statusText}) for ${url}`;
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(retryDelayMs(response, attempt));
          continue;
        }
        throw new Error(lastError);
      }
      if (!response.ok) {
        throw new Error(`Website fetch failed (${response.status} ${response.statusText}) for ${url}`);
      }
      return { html: await response.text(), status: response.status };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith("Website fetch failed")) {
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

export async function fetchWebsite(url: string, selector?: string): Promise<WatchedContent> {
  const { html, status } = await fetchHtml(url);
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, link, meta").remove();
  const title = $("title").first().text();

  let scopeText: string;
  let usedSelector: string | null = null;

  const trimmedSelector = selector?.trim();
  if (trimmedSelector) {
    const scoped = $(trimmedSelector);
    if (scoped.length === 0) {
      throw new Error(`CSS selector "${trimmedSelector}" matched nothing on ${url}`);
    }
    usedSelector = trimmedSelector;
    scopeText = scoped.text();
  } else {
    const main = $("main, article, [role='main']").first();
    const bodyText = (main.length ? main : $("body")).text();
    scopeText = `title:${title}\n${bodyText}`;
  }

  const canonicalText = normalizeWhitespace(scopeText);

  return {
    sourceType: "website" as SourceType,
    url,
    canonicalText,
    meta: {
      watcher: "websiteWatcher",
      title,
      status,
      selector: usedSelector,
      textLength: canonicalText.length,
    },
  };
}
