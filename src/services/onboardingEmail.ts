import type { Competitor, SourceType, UserProduct } from "../models";
import { fetchSource } from "../watchers";
import { escapeHtml, sendMail } from "./mailer";

type ProductEmail = Pick<UserProduct, "name" | "ownerEmail">;

export type CompetitorEmail = Pick<Competitor, "_id" | "name" | "sources">;

export type PreviewUpdate = {
  competitorName: string;
  sourceType: string;
  summary: string;
  sourceUrl: string;
  detectedAt?: Date;
  relevantArea?: string | null;
};

function snippet(text: string, max = 280): string {
  const withoutTags = text.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
  const collapsed = withoutTags.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

function dateFromMeta(meta: Record<string, unknown>): Date | undefined {
  const raw = meta.updated ?? meta.currentVersionReleaseDate ?? meta.latestDate;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw;
  }
  return undefined;
}

export function formatUpdateDate(value: Date | string | undefined): string {
  if (!value) {
    return "";
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export async function liveStorePreviewsForCompetitor(
  competitor: CompetitorEmail,
  needed: number
): Promise<PreviewUpdate[]> {
  const previews: PreviewUpdate[] = [];
  const preferred: SourceType[] = ["news", "playstore", "appstore", "blog_rss"];
  const sources = [...competitor.sources].sort((a, b) => {
    const ai = preferred.indexOf(a.type as SourceType);
    const bi = preferred.indexOf(b.type as SourceType);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const source of sources) {
    if (previews.length >= needed) {
      break;
    }
    if (!preferred.includes(source.type as SourceType)) {
      continue;
    }
    try {
      const watched = await fetchSource(source.type as SourceType, source.url);
      let summary = "";
      if (source.type === "playstore") {
        summary = snippet(String(watched.meta.recentChanges ?? watched.canonicalText));
      } else if (source.type === "appstore") {
        summary = snippet(String(watched.meta.releaseNotes ?? watched.canonicalText));
      } else {
        summary = snippet(String(watched.meta.latestTitle ?? watched.canonicalText));
      }
      if (!summary) {
        continue;
      }
      previews.push({
        competitorName: competitor.name,
        sourceType: source.type,
        summary,
        sourceUrl: source.url,
        detectedAt: dateFromMeta(watched.meta),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Onboarding preview skipped for ${competitor.name} ${source.type}: ${message}`);
    }
  }

  return previews;
}

export async function resolveLastTwoUpdates(
  competitors: CompetitorEmail[],
  existingLogs: PreviewUpdate[]
): Promise<PreviewUpdate[]> {
  const logsByName = new Map<string, PreviewUpdate[]>();
  for (const log of existingLogs) {
    const key = log.competitorName.toLowerCase();
    const list = logsByName.get(key) ?? [];
    if (list.length < 2) {
      list.push(log);
      logsByName.set(key, list);
    }
  }

  const all: PreviewUpdate[] = [];
  for (const competitor of competitors) {
    const fromLogs = logsByName.get(competitor.name.toLowerCase()) ?? [];
    const live =
      fromLogs.length >= 2 ? [] : await liveStorePreviewsForCompetitor(competitor, 2 - fromLogs.length);
    all.push(...fromLogs, ...live);
  }
  return all;
}

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:Georgia,serif;color:#111;max-width:720px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;">${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
}

export async function sendWelcomeEmail(product: ProductEmail): Promise<boolean> {
  const html = wrapHtml(
    `You’re onboarded`,
    `<p>Welcome. <strong>${escapeHtml(product.name)}</strong> is now in Competitor monitor.</p>
     <p style="color:#4b5563;">We’ll watch the rivals you add and send a daily digest to ${escapeHtml(product.ownerEmail)} when something meaningful ships.</p>
     <p>Add competitors next (by name). We’ll email you again with the sources we found and a couple of live updates so you can see it working.</p>`
  );

  const sent = await sendMail({
    to: product.ownerEmail,
    subject: `You’re onboarded: ${product.name} is on Competitor monitor`,
    html,
  });
  if (sent) {
    console.log(`Welcome email sent to ${product.ownerEmail} for ${product.name}`);
  }
  return sent;
}

export async function sendCompetitorsAddedEmail(
  product: ProductEmail,
  competitors: CompetitorEmail[],
  updates: PreviewUpdate[]
): Promise<boolean> {
  if (competitors.length === 0) {
    return false;
  }

  const list = competitors
    .map((competitor) => {
      const sources = competitor.sources
        .map((source) => {
          const url = escapeHtml(source.url);
          return `<li><span style="font-weight:600;">${escapeHtml(source.type)}</span> — <a href="${url}">${url}</a></li>`;
        })
        .join("");
      const competitorUpdates = updates.filter(
        (item) => item.competitorName.toLowerCase() === competitor.name.toLowerCase()
      );
      const updateHtml =
        competitorUpdates.length === 0
          ? `<p style="color:#4b5563;font-size:14px;">No live updates yet for this rival.</p>`
          : competitorUpdates
              .slice(0, 2)
              .map((item) => {
                const when = formatUpdateDate(item.detectedAt) || "Date unavailable";
                const area = item.relevantArea ? ` · ${escapeHtml(item.relevantArea)}` : "";
                const link = item.sourceUrl
                  ? `<div style="margin-top:4px;font-size:12px;"><a href="${escapeHtml(item.sourceUrl)}">Source</a></div>`
                  : "";
                return `<div style="padding:12px;border:1px solid #e5e7eb;margin:8px 0;">
                  <div style="font-size:12px;color:#6b7280;">${escapeHtml(item.sourceType)} · ${when}${area}</div>
                  <p style="margin:8px 0 0;white-space:pre-wrap;">${escapeHtml(item.summary)}</p>
                  ${link}
                </div>`;
              })
              .join("");
      return `<h2 style="font-size:16px;margin:24px 0 8px;">${escapeHtml(competitor.name)}</h2>
        <ul>${sources}</ul>
        <p style="font-size:13px;color:#4b5563;margin:12px 0 4px;">Last 2 updates</p>
        ${updateHtml}`;
    })
    .join("");

  const html = wrapHtml(
    `Competitors added for ${product.name}`,
    `<p>You’re now watching these rivals. Each one includes its last 2 updates so you can see the pipeline working. Daily digests go to ${escapeHtml(product.ownerEmail)}.</p>
     ${list}`
  );

  const sent = await sendMail({
    to: product.ownerEmail,
    subject: `Watching ${competitors.map((row) => row.name).join(", ")} for ${product.name}`,
    html,
  });
  if (sent) {
    console.log(`Competitor email sent to ${product.ownerEmail} (${competitors.length} rival(s))`);
  }
  return sent;
}

export function emailedUpdatesPayload(competitorName: string, updates: PreviewUpdate[], emailSent: boolean) {
  const emailedAt = emailSent ? new Date() : null;
  return updates
    .filter((item) => item.competitorName.toLowerCase() === competitorName.toLowerCase())
    .slice(0, 2)
    .map((item) => ({
      sourceType: item.sourceType,
      summary: item.summary,
      sourceUrl: item.sourceUrl,
      detectedAt: item.detectedAt ?? null,
      emailedAt,
      emailSent,
    }));
}

export async function sendWelcomeEmailSafe(product: ProductEmail): Promise<void> {
  try {
    await sendWelcomeEmail(product);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Welcome email failed: ${message}`);
  }
}

export async function sendCompetitorsAddedEmailSafe(
  product: ProductEmail,
  competitors: CompetitorEmail[],
  updates: PreviewUpdate[]
): Promise<boolean> {
  try {
    return await sendCompetitorsAddedEmail(product, competitors, updates);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Competitor onboarding email failed: ${message}`);
    return false;
  }
}
