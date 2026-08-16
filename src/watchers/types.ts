import type { SourceType } from "../models";

export type WatchedContent = {
  sourceType: SourceType;
  url: string;
  /** Canonical string that is sha256-hashed for change detection. */
  canonicalText: string;
  meta: Record<string, unknown>;
  /**
   * Stable per-item identities, present for feed sources (blog_rss, news, reddit).
   * Diffing hashes this *set* so that reordering or headline rotation never
   * looks like a change — only genuinely new items do.
   */
  itemKeys?: string[];
};
