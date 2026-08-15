# Competitor monitor — improvement backlog

A reviewed list of improvements for the competitor monitor, grounded in the current codebase (watchers, diff/Gemini pipeline, email, dashboard, cron route). Items are grouped by impact; each notes the files involved so a change can be picked up without re-reading the whole repo.

Status legend: `open` (not started), `in progress`, `done`.

## 1. Signal quality — reduce false diffs and Gemini spend (highest impact)

The core loop works, but several watchers fire "changed" on content that is not a real update. Every false diff costs a Gemini call and adds noise to digests.

### 1.1 News watcher hashes the entire feed — `done`

- **Files:** `src/watchers/newsWatcher.ts`, `src/watchers/blogRssWatcher.ts`, `src/services/diffService.ts`
- **Problem:** Google News RSS results rotate constantly (ranking, headlines, region mix). `fetchNews` reuses `fetchBlogRss`, which hashes the whole feed text, so the hash changes on nearly every fetch → false diffs → wasted Gemini calls and noisy ChangeLogs.
- **Fix (implemented):** feed sources now diff on the **set of stable item keys** (GUID → link → title) instead of the whole feed text. `diffFeedItems` in `src/services/diffService.ts` keeps an accumulated seen-key set (capped at 500) per source in `Competitor.sources[].lastSeenItemKeys`; a reshuffle, headline rotation, or item drop never counts as a change — only keys never seen before do, and Gemini only sees the text of those new items. Pre-existing sources with the old hash format are re-baselined silently on the next run (no analysis burst).

### 1.2 Blog RSS hashing includes item ordering — `done`

- **Files:** `src/watchers/blogRssWatcher.ts`
- **Problem:** `canonicalText` embeds `index:date|title|snippet` for the latest 15 items. A feed that reorders items or edits a timestamp triggers a false diff with no new content.
- **Fix (implemented):** `fetchBlogRss` now keys items by GUID → link → title, sorts by key (order-independent canonical text), exposes `itemKeys` + `meta.items` on `WatchedContent`, and the diff service (1.1) analyzes only genuinely new items. Verified by `scripts/verify-feed-diff.ts` (run `npx tsx scripts/verify-feed-diff.ts`).

### 1.3 Website watcher hashes the whole page — `done`

- **Files:** `src/watchers/websiteWatcher.ts`
- **Problem:** falls back to `<body>` text; cookie banners, nav changes, and dynamic widgets (prices, counts) change the hash without a real update.
- **Fix (implemented):** per-source **CSS selector scoping**. A `website` source can store a `selector` (`Competitor.sources[].selector`) and `fetchWebsite(url, selector)` hashes only that section's text — nav, banners, and widgets outside it are ignored. A selector that matches nothing fails loudly (`CSS selector "..." matched nothing on <url>`) so it shows up in watch logs instead of silently diffing the whole page. Wired through `fetchSource`/`checkSource`/`runWatchForUserProduct`, editable from the dashboard (`SourceSelector` component + `PATCH /api/sources`). Verified by `scripts/verify-website-selector.ts` (`npx tsx scripts/verify-website-selector.ts`).

### 1.4 No cross-source dedupe — `done`

- **Files:** `src/services/dedupe.ts` (new), `src/services/diffService.ts`, `src/services/notificationService.ts`
- **Problem:** the same news item can arrive via Google News *and* a competitor's blog RSS, get analyzed twice, and appear twice in the digest.
- **Fix (implemented):** shared helpers in `src/services/dedupe.ts` match stories by normalized title (lowercase, punctuation-stripped, trailing " - Publisher" segments removed, plus containment for ≥15-char titles). Two layers: (1) before analysis, `diffService` skips feed items whose title was already analyzed for the same competitor within 7 days (saves the Gemini call; `[DUPLICATE]` in watch logs); (2) at digest time, `notificationService` drops duplicate-titled ChangeLogs per competitor before emailing (safety net that also cleans up legacy duplicates). Persisted ChangeLogs now store only the analyzed items in `rawDiff.meta.items` so dedupe compares against what was actually analyzed. Verified by `scripts/verify-dedupe.ts` (`npx tsx scripts/verify-dedupe.ts`).

## 2. Dashboard control — v1 is add-only

### 2.1 Edit / delete competitors, sources, and products — `done`

- **Files:** `dashboard/app/api/products/route.ts`, `dashboard/app/api/competitors/route.ts`, `dashboard/app/api/sources/route.ts`, `dashboard/app/ProductForm.tsx`, `dashboard/app/CompetitorControls.tsx`, `dashboard/app/SourceActions.tsx`, `dashboard/app/page.tsx`
- **Problem:** competitors can be added but never removed, renamed, paused, or have sources toggled; products cannot be edited after creation.
- **Fix (implemented):** `PATCH`/`DELETE` on products (cascades competitors + ChangeLogs + AlertLogs), competitors (rename + cascade delete), and sources (selector, `enabled` pause toggle, remove). UI: `ProductForm` gained Edit/Delete, `CompetitorControls` rename/delete, `SourceActions` pause/remove per source. The watcher skips disabled sources (`[SKIPPED]` in logs) via a new `enabled` flag on `Competitor.sources[]`. Dashboard model copy now also defines `AlertLog` (schema drift closed).

### 2.2 Custom source URLs in the UI — `done`

- **Files:** `dashboard/app/AddSource.tsx`, `dashboard/app/api/sources/route.ts`
- **Problem:** the models fully support arbitrary `sources[{type,url}]`, but both CLI and UI only auto-discover by name. SaaS rivals without store listings or RSS cannot be watched from the UI.
- **Fix (implemented):** `AddSource` form per competitor card (`+ Add source`) with type select + URL (+ optional CSS selector for `website`), backed by `POST /api/sources`. URLs are validated/normalized via the shared `normalizeHttpUrl` (now exported from `src/services/discoverSources.ts`), duplicates are rejected, and website sources can carry a selector at creation.

### 2.3 "Run watch now" from the dashboard — `done`

- **Files:** `dashboard/app/WatchButton.tsx`, `dashboard/app/api/watch/route.ts`
- **Problem:** users must SSH and run `npm run watch-now` to trigger a check; a founder-facing tool should have a button.
- **Fix (implemented):** `POST /api/watch` runs `runWatchForUserProduct(id, { analyze: true })` for the selected product and returns a summary (total / changed / analyzed / duplicates / errors / paused + per-source rows). `WatchButton` sits in the "Watching" header, shows progress, counts, and per-source errors. Note: `maxDuration = 120` — fine locally, on Vercel Hobby (60s cap) large products may time out (see 4.3).

### 2.4 Raw diff view — `open`

- **Files:** `dashboard/app/Timeline.tsx`, `dashboard/app/api/changelogs/route.ts`
- **Problem:** timeline shows only the AI summary; users cannot see what actually changed.
- **Fix:** expose the before/after diff (or canonical text) in the API and a collapsible "what changed" in the timeline.

### 2.5 Timeline pagination / filtering — `open`

- **Files:** `dashboard/app/page.tsx`, `dashboard/app/api/changelogs/route.ts`
- **Problem:** the timeline and API return all meaningful logs, unbounded over time.
- **Fix:** pagination (limit/offset or cursor) and filters (competitor, area, urgency, date range).

## 3. Notifications

### 3.1 Immediate alert for high urgency — `open`

- **Files:** `src/services/notificationService.ts`, `src/services/diffService.ts`
- **Problem:** every change, including `urgency: high`, waits for the next daily digest (up to 24h).
- **Fix:** on analysis, immediately email (or post a webhook) for `urgency: high`; keep the daily digest for everything else. Reuse `sendMail` and `AlertLog` dedupe.

### 3.2 Slack / webhooks (documented as deferred) — `open`

- **Files:** `src/models/AlertLog.ts` (channel `"slack"` already reserved), `src/services/notificationService.ts`
- **Problem:** no channel beyond email; the README and PHASES.md list Slack as a future add.
- **Fix:** implement `sendSlackAlert` for meaningful + medium/high urgency; extend AlertLog dedupe per channel.

### 3.3 Email deliverability basics — `open`

- **Files:** `src/services/mailer.ts`, `src/services/notificationService.ts`, `src/services/onboardingEmail.ts`
- **Problem:** no unsubscribe link in emails.
- **Fix:** add a one-click unsubscribe (mailto or URL) to digest and onboarding emails.

## 4. Reliability & ops

### 4.1 Unit tests — `open`

- **Files:** whole `src/`, no test runner configured
- **Problem:** only manual test tables in `PHASES.md`; no automated tests.
- **Fix:** unit tests for `hashContent`, per-item diff logic, `extractJsonObject` fallback parsing, `asUrgency`, AlertLog dedupe, and URL/id parsing (`src/watchers/parseSource.ts`). Add `vitest` (or Node's built-in test runner) and a `test` npm script.

### 4.2 Run-locking — `open`

- **Files:** `src/jobs/watchNow.ts`, `src/services/diffService.ts`, `dashboard/app/api/cron/run/route.ts`
- **Problem:** overlapping runs (manual `watch-now` + cron) can race updating `lastCheckedHash` and double-analyze the same diff.
- **Fix:** a per-job lock (Mongo unique doc with TTL, or `process`-level flag for the local scheduler) so only one watch/digest runs at a time.

### 4.3 Vercel Hobby duration mismatch — `open`

- **Files:** `dashboard/app/api/cron/run/route.ts` (`maxDuration = 300`), `README.md`
- **Problem:** the README promises ~5 min runs, but Vercel Hobby caps function duration at 60s; a watch across many sources will time out on Hobby.
- **Fix:** batch sources per invocation (accept a `limit`/offset param so cron-job.org can paginate) or document that the pipeline needs Pro.

### 4.4 Bulk-add concurrency — `open`

- **Files:** `dashboard/app/api/competitors/route.ts`, `src/services/discoverSources.ts`
- **Problem:** `discoverSourcesForName` runs ~15 feed probes + homepage + 2 store lookups **sequentially** per name; adding 5 names can take minutes.
- **Fix:** a small concurrency limit (e.g., 3–4 names at a time) with per-name error isolation.

### 4.5 Retention / TTL — `open`

- **Files:** `src/models/ChangeLog.ts`, `src/models/AlertLog.ts`
- **Problem:** ChangeLogs (with full `rawDiff` content) and AlertLogs grow forever.
- **Fix:** TTL index on `detectedAt`/`createdAt` or a retention job (e.g., keep 90 days).

### 4.6 Query indexes — `open`

- **Files:** `src/models/ChangeLog.ts`
- **Problem:** digest and timeline queries filter by `competitorId` + `isMeaningful` + `detectedAt`, but only `competitorId` is indexed.
- **Fix:** compound index `{ competitorId: 1, isMeaningful: 1, detectedAt: -1 }`.

## 5. Code health — cheap, prevents drift

### 5.1 Single source of truth for schemas — `open`

- **Files:** `src/models/*` vs `dashboard/lib/models.ts`
- **Problem:** the same Mongoose schemas are defined twice and already diverge (dashboard has no `AlertLog`, `registerModel` behaves differently, urgency enum duplicated).
- **Fix:** share models from `src/models` in the dashboard, or extract a shared package.

### 5.2 De-duplicate helpers — `open`

- **Files:** `src/services/aiAnalysisService.ts`, `src/services/suggestCompetitors.ts`
- **Problem:** `extractJsonObject` is copy-pasted; `SOURCE_TYPES` exists in `src/models/Competitor.ts` and `dashboard/lib/sourceTypes.ts`.
- **Fix:** single `parseJsonFromModel` util and one source of truth for source types.

### 5.3 CI — `open`

- **Files:** root (no CI config)
- **Problem:** nothing runs typecheck/tests on push.
- **Fix:** a GitHub Action running `npm run typecheck` (+ tests once 4.1 lands) for `src/` and `dashboard/`.

## 6. Security — only matters beyond local use

### 6.1 Auth — `open`

- **Files:** all `dashboard/app/api/*`
- **Problem:** every dashboard route is open; anyone who can reach the URL can read config and write data. Fine for local v1, risky on a deployed URL.
- **Fix:** simple session/password auth on the dashboard before any real deployment.

### 6.2 Outbound-fetch policy (SSRF) — `open`

- **Files:** `src/watchers/websiteWatcher.ts`, `src/services/discoverSources.ts`
- **Problem:** sources accept any URL and the server fetches it — acceptable single-user, a risk in multi-tenant.
- **Fix:** block private/loopback/link-local hosts (or document the single-user assumption).

### 6.3 Email validation — `open`

- **Files:** `src/jobs/addCompetitor.ts`, `dashboard/app/api/products/route.ts`
- **Problem:** `ownerEmail` is accepted without format validation.
- **Fix:** basic email regex + `type="email"` is already in the form; enforce server-side.

## 7. Small polish

### 7.1 Configurable Google News locale — `open`

- **Files:** `src/watchers/newsWatcher.ts`
- **Problem:** news search is hardcoded to India (`hl=en-IN&gl=IN&ceid=IN:en`) while the product claims industry-agnostic.
- **Fix:** make locale a per-product setting with `en-US`-style defaults.

### 7.2 Analysis content truncation — `open`

- **Files:** `src/services/aiAnalysisService.ts`
- **Problem:** prompt truncates content at 8,000 chars; a 15-item RSS feed can cut off the newest items.
- **Fix:** when truncating, prefer the newest/headline items; surface truncation in the prompt.

### 7.3 Area-based alerting — `open`

- **Files:** `src/models/ChangeLog.ts` (`relevantArea` free text), `src/services/notificationService.ts`
- **Problem:** `relevantArea` is free text, so users cannot say "alert me only on pricing changes".
- **Fix:** normalize areas into a small taxonomy and add per-product alert filters.

---

## Suggested sequencing

| Step | Items | Why first |
| --- | --- | --- |
| 1 | 1.1, 1.2 (per-item news/RSS hashing) | Directly cuts false diffs and Gemini spend; the largest noise source today |
| 2 | 2.1, 2.2, 2.3 (dashboard CRUD, custom sources, watch-now) | Turns the tool from add-only demo into a usable product |
| 3 | 4.1, 4.2 (tests + run-locking) | Prerequisite for any production rollout |
| 4 | 3.1 (high-urgency alerts), 4.3 (Vercel duration) | Notification value + production correctness |
| 5 | 5.x, 6.x, 7.x | Maintenance, security, polish |

Each item is self-contained; pick up any single one without completing the rest.
