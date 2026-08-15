import type { SourceType } from "../models";
import { importEsm } from "./importEsm";
import { extractPlayStoreAppId, normalizeWhitespace } from "./parseSource";
import type { WatchedContent } from "./types";

type PlayScraper = {
  app: (opts: { appId: string; lang?: string; country?: string }) => Promise<{
    title?: string;
    recentChanges?: string;
    version?: string;
    updated?: string;
    url?: string;
  }>;
};

async function loadPlayScraper(): Promise<PlayScraper> {
  const mod = await importEsm<{ default?: PlayScraper } & PlayScraper>("google-play-scraper");
  const gplay = mod.default ?? mod;
  if (!gplay?.app) {
    throw new Error("google-play-scraper did not export app()");
  }
  return gplay;
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
