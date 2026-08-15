import * as cheerio from "cheerio";
import { googleNewsRssUrl } from "../watchers/newsWatcher";
import { importEsm } from "../watchers/importEsm";

type SourceType = "playstore" | "appstore" | "blog_rss" | "website" | "news";

export type DiscoveredSource = {
  type: SourceType;
  url: string;
};

export type DiscoveryNote = {
  kind: "playstore" | "appstore" | "website" | "blog_rss" | "news";
  detail: string;
};

export type DiscoveryResult = {
  sources: DiscoveredSource[];
  notes: DiscoveryNote[];
};

const USER_AGENT = "Mozilla/5.0 (compatible; CompetitorMonitor/0.1; +https://localhost)";
const FEED_PATHS = [
  "/feed",
  "/feed/",
  "/rss.xml",
  "/rss",
  "/atom.xml",
  "/blog/feed",
  "/blog/rss.xml",
  "/feed.xml",
  "/index.xml",
];

function nameKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function looksRelated(haystack: string, name: string): boolean {
  const hay = nameKey(haystack);
  const needle = nameKey(name);
  if (!hay || !needle) {
    return false;
  }
  if (hay.includes(needle) || needle.includes(hay)) {
    return true;
  }
  const tokens = needle.split(" ").filter((token) => token.length >= 3);
  return tokens.some((token) => hay.includes(token));
}

function slugFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function normalizeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

type PlayScraper = {
  search: (opts: {
    term: string;
    num: number;
    lang: string;
    country: string;
  }) => Promise<Array<{ appId?: string; title?: string; developer?: string; url?: string }>>;
  app: (opts: { appId: string; lang: string; country: string }) => Promise<{
    developerWebsite?: string;
    url?: string;
    title?: string;
    developer?: string;
  }>;
};

async function loadPlayScraper(): Promise<PlayScraper> {
  const mod = await importEsm<{ default?: PlayScraper } & PlayScraper>("google-play-scraper");
  const gplay = mod.default ?? mod;
  if (!gplay?.app || !gplay.search) {
    throw new Error("google-play-scraper did not export search()/app()");
  }
  return gplay;
}

async function fetchText(url: string, timeoutMs: number): Promise<{ ok: boolean; contentType: string; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8",
      },
    });
    const body = await response.text();
    return {
      ok: response.ok,
      contentType: response.headers.get("content-type") ?? "",
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

type PlayHit = {
  appId: string;
  title: string;
  developer: string;
  url: string;
  website: string | null;
};

async function findPlayStore(name: string): Promise<{ hit: PlayHit | null; note: DiscoveryNote }> {
  try {
    const gplay = await loadPlayScraper();
    const results = await gplay.search({ term: name, num: 8, lang: "en", country: "us" });
    if (!results.length) {
      return { hit: null, note: { kind: "playstore", detail: "not found" } };
    }

    const ranked = results
      .filter((row) => row.appId)
      .map((row) => {
        const title = row.title ?? "";
        const developer = row.developer ?? "";
        const related = looksRelated(title, name) || looksRelated(developer, name);
        return { row, related, score: related ? (looksRelated(title, name) ? 2 : 1) : 0 };
      })
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best?.row.appId) {
      return { hit: null, note: { kind: "playstore", detail: "not found" } };
    }

    let website: string | null = null;
    try {
      const app = await gplay.app({ appId: best.row.appId, lang: "en", country: "us" });
      website = normalizeHttpUrl(app.developerWebsite ?? "");
      const url =
        normalizeHttpUrl(app.url ?? "") ??
        `https://play.google.com/store/apps/details?id=${best.row.appId}`;
      return {
        hit: {
          appId: best.row.appId,
          title: app.title ?? best.row.title ?? "",
          developer: app.developer ?? best.row.developer ?? "",
          url,
          website,
        },
        note: {
          kind: "playstore",
          detail: best.related
            ? `matched "${app.title ?? best.row.title}" by ${app.developer ?? best.row.developer}`
            : `auto-matched "${app.title ?? best.row.title}" — verify this is the right app`,
        },
      };
    } catch {
      const url =
        normalizeHttpUrl(best.row.url ?? "") ??
        `https://play.google.com/store/apps/details?id=${best.row.appId}`;
      return {
        hit: {
          appId: best.row.appId,
          title: best.row.title ?? "",
          developer: best.row.developer ?? "",
          url,
          website: null,
        },
        note: {
          kind: "playstore",
          detail: `matched id ${best.row.appId} (listing details unavailable)`,
        },
      };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { hit: null, note: { kind: "playstore", detail: `search failed: ${message}` } };
  }
}

type AppHit = {
  id: number;
  title: string;
  seller: string;
  url: string;
  website: string | null;
};

async function findAppStore(name: string): Promise<{ hit: AppHit | null; note: DiscoveryNote }> {
  try {
    const params = new URLSearchParams({
      term: name,
      entity: "software",
      country: "us",
      limit: "8",
    });
    const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) {
      return { hit: null, note: { kind: "appstore", detail: `search failed (${response.status})` } };
    }
    const payload = (await response.json()) as {
      results?: Array<{
        trackId?: number;
        trackName?: string;
        sellerName?: string;
        trackViewUrl?: string;
        sellerUrl?: string;
      }>;
    };
    const results = payload.results ?? [];
    if (!results.length) {
      return { hit: null, note: { kind: "appstore", detail: "not found" } };
    }

    const ranked = results
      .filter((row) => row.trackId)
      .map((row) => {
        const title = row.trackName ?? "";
        const seller = row.sellerName ?? "";
        const related = looksRelated(title, name) || looksRelated(seller, name);
        return { row, related, score: related ? (looksRelated(title, name) ? 2 : 1) : 0 };
      })
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]?.row;
    if (!best?.trackId) {
      return { hit: null, note: { kind: "appstore", detail: "not found" } };
    }

    const url =
      normalizeHttpUrl(best.trackViewUrl ?? "") ?? `https://apps.apple.com/us/app/id${best.trackId}`;
    return {
      hit: {
        id: best.trackId,
        title: best.trackName ?? "",
        seller: best.sellerName ?? "",
        url,
        website: normalizeHttpUrl(best.sellerUrl ?? ""),
      },
      note: {
        kind: "appstore",
        detail: ranked[0]?.related
          ? `matched "${best.trackName}" by ${best.sellerName}`
          : `auto-matched "${best.trackName}" — verify this is the right app`,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { hit: null, note: { kind: "appstore", detail: `search failed: ${message}` } };
  }
}

async function tryFeedUrl(url: string): Promise<string | null> {
  try {
    const result = await fetchText(url, 8000);
    if (!result.ok) {
      return null;
    }
    const looksLikeFeed =
      /xml|rss|atom/i.test(result.contentType) || /<rss|<feed/i.test(result.body.slice(0, 800));
    return looksLikeFeed ? url : null;
  } catch {
    return null;
  }
}

async function findBlogRss(homepage: string): Promise<{ url: string | null; detail: string }> {
  const origin = originOf(homepage);
  if (!origin) {
    return { url: null, detail: "no website to scan for RSS" };
  }

  for (const feedPath of FEED_PATHS) {
    const found = await tryFeedUrl(`${origin}${feedPath}`);
    if (found) {
      return { url: found, detail: `found via ${feedPath}` };
    }
  }

  try {
    const page = await fetchText(origin, 10000);
    if (!page.ok) {
      return { url: null, detail: `homepage fetch failed (${page.contentType})` };
    }
    const $ = cheerio.load(page.body);
    const href = $('link[type="application/rss+xml"], link[type="application/atom+xml"]').first().attr("href");
    if (href) {
      const resolved = href.startsWith("http") ? href : new URL(href, origin).toString();
      const confirmed = await tryFeedUrl(resolved);
      if (confirmed) {
        return { url: confirmed, detail: "found via <link rel=\"alternate\">" };
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { url: null, detail: `homepage fetch failed: ${message}` };
  }

  return { url: null, detail: "no discoverable RSS feed" };
}

async function websiteLooksLive(url: string): Promise<boolean> {
  try {
    const result = await fetchText(url, 8000);
    return result.ok && result.body.length > 200;
  } catch {
    return false;
  }
}

export async function discoverSourcesForName(name: string): Promise<DiscoveryResult> {
  const notes: DiscoveryNote[] = [];
  const sources: DiscoveredSource[] = [];
  const seen = new Set<string>();

  function add(type: SourceType, url: string): void {
    const normalized = normalizeHttpUrl(url);
    if (!normalized) {
      return;
    }
    const key = `${type}:${normalized}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    sources.push({ type, url: normalized });
  }

  const [play, app] = await Promise.all([findPlayStore(name), findAppStore(name)]);
  notes.push(play.note, app.note);

  if (play.hit) {
    add("playstore", play.hit.url);
  }
  if (app.hit) {
    add("appstore", app.hit.url);
  }

  const websiteCandidates = [play.hit?.website, app.hit?.website, `https://${slugFromName(name)}.com`].filter(
    (value): value is string => Boolean(value)
  );

  let homepage: string | null = null;
  for (const candidate of websiteCandidates) {
    const normalized = normalizeHttpUrl(candidate);
    if (!normalized) {
      continue;
    }
    const live = await websiteLooksLive(normalized);
    if (live) {
      homepage = originOf(normalized) ?? normalized;
      break;
    }
  }

  if (homepage) {
    add("website", homepage);
    notes.push({ kind: "website", detail: homepage });
    const rss = await findBlogRss(homepage);
    notes.push({ kind: "blog_rss", detail: rss.detail });
    if (rss.url) {
      add("blog_rss", rss.url);
    }
  } else {
    notes.push({ kind: "website", detail: "not found" });
    notes.push({ kind: "blog_rss", detail: "skipped — no website" });
  }

  const newsUrl = googleNewsRssUrl(name);
  add("news", newsUrl);
  notes.push({ kind: "news", detail: `Google News RSS for "${name}"` });

  return { sources, notes };
}
