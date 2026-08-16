# More sources to watch & more services to integrate

A planning doc for the competitor monitor: what other **update sources** we can watch, and what other **services** we can plug in. Everything here builds on the current architecture — one watcher per `source.type`, hashing + per-item feed keys for diffing, Gemini analysis, `AlertLog` per notification channel.

> **Rule of thumb:** any public **RSS/Atom feed** already works today with **zero code** — add it as a `blog_rss` source in the dashboard. Feeds get per-item diffing (`lastSeenItemKeys`) for free, so only genuinely new items trigger Gemini.

---

## 1. What we watch today

| `source.type` | Watcher | What it captures |
| --- | --- | --- |
| `playstore` | `playStoreWatcher.ts` | Play Store "What's New" release notes |
| `appstore` | `appStoreWatcher.ts` | App Store release notes |
| `blog_rss` | `blogRssWatcher.ts` | Any RSS/Atom feed (per-item diffing) |
| `news` | `newsWatcher.ts` | Google News search RSS for the competitor name |
| `reddit` | `redditWatcher.ts` | Reddit search RSS for the competitor name (community chatter) |
| `website` | `websiteWatcher.ts` | Any page, optionally scoped to a CSS selector (e.g. a changelog section) |

---

## 2. More update sources to watch

### 2.1 Zero-code — add today as a `blog_rss` source

These all publish RSS/Atom and drop straight into the existing feed watcher. No code changes, no API keys:

| Source | Feed URL pattern | Signal |
| --- | --- | --- |
| YouTube channel | `https://www.youtube.com/feeds/videos.xml?channel_id=<ID>` | New videos, demos, webinars |
| Reddit subreddit / user | `https://www.reddit.com/r/<name>/.rss`, `https://www.reddit.com/user/<name>/.rss` | A specific community or account (search mentions are already a `reddit` source) |
| GitHub releases | `https://github.com/<owner>/<repo>/releases.atom` | Every release announcement (also `commits.atom`, `tags.atom`) |
| Status pages | `https://<org>.statuspage.io/history.atom` (most statuspage.io instances) | Outages / degraded performance |
| Product Hunt | `https://www.producthunt.com/feed` (or topic feeds) | Competitor launches |
| Podcasts | any podcast RSS URL | Episodes that announce product updates |
| Google Alerts | an alert's RSS feed link | Web mentions beyond Google News (blogs, forums, press) |
| Any changelog with a feed | e.g. `https://<company>/changelog.xml`, `/feed` | Release notes without visiting the page |

**Note:** many SaaS changelogs don't publish RSS. For those, keep the `website` source type with a CSS selector on the changelog section (already implemented).

### 2.2 New watchers — small, free APIs

These need a new watcher file plus a `SOURCE_TYPES` entry, but use free public APIs and no auth:

| Source | API | What it adds | Effort |
| --- | --- | --- | --- |
| **App store reviews & ratings** | existing `app-store-scraper` / `google-play-scraper` (already deps) | Review count, rating score, recent reviews — a rating drop or "app is broken" cluster is a product-quality signal that release notes never show | Small |
| **GitHub releases (structured)** | `https://api.github.com/repos/<owner>/<repo>/releases` (public, rate-limited) | Tag names, dates, assets, diffs between tags — richer than the atom feed, plus watch any public repo, not just via RSS | Small |
| **Job postings** | Greenhouse `https://boards-api.greenhouse.io/v1/boards/<company>/jobs`, Lever `https://api.lever.co/v0/postings/<company>?mode=json` | Hiring = product direction (e.g. suddenly hiring for a mobile team, a new region, an enterprise tier) | Small–medium |
| **npm / PyPI / crates.io packages** | `https://registry.npmjs.org/<pkg>`, `https://pypi.org/pypi/<pkg>/json`, `https://crates.io/api/v1/crates/<name>` | Version bumps of a competitor's OSS library, SDK, or CLI | Small |
| **Hacker News mentions** | `https://hn.algolia.com/api/v1/search_by_date?query=<name>&tags=story` | Launch buzz, show-HN threads, community sentiment | Small |
| **SEC EDGAR filings** | `https://efts.sec.gov/LATEST/search-index?q=<company>&forms=10-Q,10-K,8-K` | Financial + material changes for public competitors | Small–medium |
| **New subdomains (cert transparency)** | `https://crt.sh/?q=%25.<domain>&output=json` | New product lines / regions / staging of unreleased features | Small |
| **Stack Overflow / forums** | search APIs or site RSS | Developer-facing problems with the competitor's product | Small |

### 2.3 Structured page watchers — more than "text changed"

The `website` watcher diffs text; these would diff **structure** so Gemini only sees real changes and can compare before/after numerically:

| Source | Idea | Effort |
| --- | --- | --- |
| **Pricing pages** | Parse price/plan/tier into JSON (cheerio already available); diff structurally — a plan rename or price change is exactly what a founder wants, and text-diffing a pricing page is noisy | Medium |
| **Changelog pages** | Parse the changelog into dated entries with stable keys so re-renders don't re-trigger analysis (like feed items) | Medium |
| **API docs / OpenAPI specs** | Fetch `openapi.json`, diff endpoints/schemas — reveals new features before they're marketed | Medium |
| **Marketplace listings** (G2, Capterra) | Review counts/scores via scraping | Medium–hard (fragile, may be blocked; treat as nice-to-have) |

### 2.4 Hard / out of scope (for now)

| Source | Why it's hard |
| --- | --- |
| Twitter/X | Paid API; no public RSS anymore |
| LinkedIn company pages | No public API; scraping violates ToS |
| Facebook / Instagram | Graph API requires app review + tokens; not RSS-able |
| Discord server announcements | No public feed API |
| Gated newsletters | Content requires a subscription; only reachable by forwarding inbox emails |
| Ahrefs / Semrush | Paid APIs — heavy for v1, better as later enrichment |
| Anything behind a login | Violates the README's core constraint: "it only fetches URLs you provide" |

---

## 3. More services to integrate

### 3.1 Notification channels (outbound)

| Service | What it does | Effort | Notes |
| --- | --- | --- | --- |
| **Slack webhook** | Post meaningful / medium-high urgency changes to a channel | Small | `AlertLog` already reserves `channel: "slack"`; `sendSlackAlert` is pre-planned in IMPROVEMENTS.md §3.2 |
| **Discord webhook** | Same as Slack, via a webhook URL | Small | |
| **Telegram bot** | DM the owner for high-urgency items | Small | Bot token + chat id |
| **Generic webhook** | POST JSON to any URL — instantly unlocks Zapier / Make / n8n → Notion, Linear, Sheets, SMS, whatever | Small | Best "one webhook to rule them all" option |
| **SMS (Twilio)** | Text only on `urgency: high` | Medium | Costs money per message; gate carefully |
| **Web push / mobile push** | Browser notification (VAPID) or Expo push for a mobile app | Medium | Overkill for v1, nice for a real product |

Also consider **3.1a — immediate high-urgency alerting** (IMPROVEMENTS.md §3.1, still open): today everything waits for the daily digest. Email (or webhook) right away for `urgency: high` is the single biggest notification win.

### 3.2 Email infrastructure

| Service | What it adds | Effort |
| --- | --- | --- |
| **Resend / SES / SendGrid / Postmark** | Managed sending instead of raw SMTP (Nodemailer today); opens/clicks tracking, bounce handling, deliverability | Small — swap `mailer.ts` transport, keep `AlertLog` |
| **One-click unsubscribe** | Add `List-Unsubscribe` header / unsubscribe URL to digest + onboarding emails (IMPROVEMENTS.md §3.3) | Small |

### 3.3 AI / analysis

| Service | What it adds | Effort |
| --- | --- | --- |
| **Claude / OpenAI as alternative analyzers** | Today Gemini-only; a provider cascade already exists for Gemini models — extend it to other vendors | Small–medium |
| **Embedding-based dedupe** | Replace title-matching in `dedupe.ts` with semantic similarity so paraphrased versions of the same story collapse | Medium |

### 3.4 Enrichment & actions

| Service | What it adds | Effort |
| --- | --- | --- |
| **Linear / Notion / Trello** | Auto-create a ticket for `urgency: high` changes (via generic webhook or direct API) | Small–medium |
| **Feedly / Inoreader** | Aggregate many feeds per competitor, read-later, extra sources not in Google News | Medium |
| **Ahrefs / Semrush** | SEO/backlink/keyword rank changes — later-stage enrichment | Medium (paid) |

### 3.5 Ops & reliability

| Service | What it adds | Effort |
| --- | --- | --- |
| **GitHub Actions cron** | Replace cron-job.org with a scheduled workflow hitting `/api/cron/run` (already documented as Lambda-friendly) | Small |
| **Sentry / Axiom** | Watch-run logs, Gemini errors, email failures surfaced instead of lost in Vercel logs | Small |
| **Uptime check on the cron route** | Alert you if the pipeline stops running entirely | Small |
| **Better Stack / healthchecks.io** | Ping after each successful watch/digest run | Small |

---

## 4. How to add any of these (checklist)

**New source type** — touch these files:

1. `src/models/Competitor.ts` — add the value to `SOURCE_TYPES`
2. `src/watchers/<name>Watcher.ts` — new watcher returning `WatchedContent` with `canonicalText` (+ `itemKeys` if it's item-based, so feeds never false-diff)
3. `src/watchers/index.ts` — import + add a `case` in `fetchSource`
4. `dashboard/lib/sourceTypes.ts` — label for the dashboard dropdown
5. `src/services/discoverSources.ts` — optional: auto-discover it when adding a competitor by name
6. `npm run typecheck` + a `test-watch` run

**New notification channel** — touch these files:

1. `src/models/AlertLog.ts` — add the channel value (e.g. `"slack"` already reserved)
2. `src/services/notificationService.ts` — send + AlertLog dedupe per channel (dedupe must be per `changeLogId` + channel)
3. `.env.example` — new env vars (never commit real keys)
4. README — document it

---

## 5. Suggested order

| Step | Do this | Why first |
| --- | --- | --- |
| 1 | Add RSS-based sources (2.1) for real competitors via the dashboard | Zero code, immediate coverage (YouTube, extra Reddit subreddits/users, GitHub releases, status pages, podcasts, Google Alerts) |
| 2 | App store **reviews/ratings** watcher (2.2) | Highest signal-per-effort: catches quality problems release notes hide; scrapers already in `package.json` |
| 3 | Slack + immediate high-urgency alerting (3.1) | Turns the digest into a real alerting tool; `slack` channel already reserved |
| 4 | Job board + GitHub releases watchers (2.2) | Early product-direction signals for SaaS competitors |
| 5 | Generic webhook (3.1) | Unlocks every downstream app with one integration |
| 6 | Pricing-page structural diff (2.3) | The change founders most want to see, done without noise |
| 7 | Email infra upgrade + monitoring (3.2, 3.5) | Production readiness |

Everything is independent — pick any single item without completing the rest.
