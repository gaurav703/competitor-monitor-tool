import type { SourceType } from "../models";
import { extractPlayStoreAppId, normalizeWhitespace } from "./parseSource";
import type { WatchedContent } from "./types";

async function loadPlayScraper() {
  const mod = await import("google-play-scraper");
  return mod.default;
}

export async function fetchPlayStore(url: string): Promise<WatchedContent> {
  const appId = extractPlayStoreAppId(url);
  const gplay = await loadPlayScraper();
  const app = await gplay.app({ appId, lang: "en", country: "us" });

  const recentChanges = app.recentChanges ?? "";
  const version = app.version ?? "";
  const updated = app.updated ?? "";
  const canonicalText = normalizeWhitespace(
    ["title:" + (app.title ?? ""), "version:" + version, "updated:" + String(updated), "whatsNew:" + recentChanges].join("\n")
  );

  return {
    sourceType: "playstore" as SourceType,
    url,
    canonicalText,
    meta: {
      watcher: "playStoreWatcher",
      appId,
      title: app.title,
      version,
      updated,
      recentChanges,
      storeUrl: app.url,
    },
  };
}
