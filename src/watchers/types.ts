import type { SourceType } from "../models";

export type WatchedContent = {
  sourceType: SourceType;
  url: string;
  /** Canonical string that is sha256-hashed for change detection. */
  canonicalText: string;
  meta: Record<string, unknown>;
};
