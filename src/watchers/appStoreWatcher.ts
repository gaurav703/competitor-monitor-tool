import store from "app-store-scraper";
import type { SourceType } from "../models";
import { extractAppStoreId, normalizeWhitespace } from "./parseSource";
import type { WatchedContent } from "./types";

export async function fetchAppStore(url: string): Promise<WatchedContent> {
  const { id, country } = extractAppStoreId(url);
  const app = await store.app({ id, country });

  const releaseNotes = app.releaseNotes ?? "";
  const version = app.version ?? "";
  const released = app.currentVersionReleaseDate ?? "";
  const canonicalText = normalizeWhitespace(
    [
      "title:" + (app.title ?? ""),
      "version:" + version,
      "released:" + String(released),
      "releaseNotes:" + releaseNotes,
    ].join("\n")
  );

  return {
    sourceType: "appstore" as SourceType,
    url,
    canonicalText,
    meta: {
      watcher: "appStoreWatcher",
      id,
      country,
      title: app.title,
      version,
      currentVersionReleaseDate: released,
      releaseNotes,
      storeUrl: app.url,
    },
  };
}
