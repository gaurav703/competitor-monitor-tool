/**
 * Cross-source duplicate detection for feed items.
 *
 * The same story can arrive via Google News AND a competitor's own blog RSS,
 * get analyzed twice, and appear twice in the digest. We match on normalized
 * titles so the second arrival is skipped before analysis (saving Gemini
 * calls) and before emailing.
 */

/**
 * Lowercase, keep alphanumerics/spaces, and strip a trailing source segment
 * like " - TechCrunch" / " | Reuters" / " — CNBC" when the rest is long
 * enough to be the real title.
 */
export function normalizeTitle(text: string): string {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\s\-—–|:]+/g, "").trim();
  const trailing = cleaned.match(/^(.*?)\s*[\-—–|:]\s*([a-z0-9]{2,40})$/);
  const core =
    trailing && trailing[1] && trailing[1].trim().length >= 12 ? trailing[1].trim() : cleaned;
  return core.replace(/[\-—–|:]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Two titles refer to the same story when they normalize equal, or when the
 * shorter one (at least 15 chars) is contained in the longer one.
 */
export function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) {
    return false;
  }
  if (na === nb) {
    return true;
  }
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= 15 && longer.includes(shorter);
}

/**
 * Extract normalized titles from a persisted ChangeLog rawDiff. Feed-sourced
 * ChangeLogs store the analyzed items in rawDiff.meta.items; other sources
 * return nothing (they have no structured title to compare).
 */
export function titlesFromRawDiff(rawDiff: unknown): string[] {
  const meta = (rawDiff as { meta?: { items?: Array<{ title?: string }> } } | null | undefined)
    ?.meta;
  const titles = (meta?.items ?? [])
    .map((item) => item.title)
    .filter((title): title is string => typeof title === "string" && title.trim().length > 0);
  return [...new Set(titles.map(normalizeTitle))].filter(Boolean);
}

export type DedupableLog = {
  competitorId: { toString(): string } | string;
  rawDiff: unknown;
};

/**
 * Drop logs whose feed-item titles were already seen for the same competitor,
 * keeping the FIRST occurrence (call with most-recent-first ordering). Logs
 * without structured titles (non-feed sources) are always kept.
 */
export function dedupeLogsByTitle<T extends DedupableLog>(logs: T[]): T[] {
  const seenByCompetitor = new Map<string, string[]>();
  const result: T[] = [];
  for (const log of logs) {
    const titles = titlesFromRawDiff(log.rawDiff);
    if (titles.length === 0) {
      result.push(log);
      continue;
    }
    const competitorKey =
      typeof log.competitorId === "string" ? log.competitorId : log.competitorId.toString();
    const seen = seenByCompetitor.get(competitorKey) ?? [];
    if (titles.some((title) => seen.some((existing) => titlesMatch(existing, title)))) {
      continue;
    }
    seen.push(...titles);
    seenByCompetitor.set(competitorKey, seen);
    result.push(log);
  }
  return result;
}
