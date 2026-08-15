import { isSmtpConfigured } from "../config/env";
import { AlertLogModel, ChangeLogModel, CompetitorModel, UserProductModel } from "../models";
import type { ChangeLog, UserProduct } from "../models";
import { escapeHtml, sendMail } from "./mailer";

export type DigestChange = {
  _id: ChangeLog["_id"];
  competitorId: ChangeLog["competitorId"];
  competitorName: string;
  sourceType: string;
  aiSummary: string | null;
  relevantArea: string | null;
  urgency: string | null;
  detectedAt: Date;
  sourceUrl?: string;
};

function urgencyLabel(urgency: string | null): string {
  if (urgency === "high") {
    return "High";
  }
  if (urgency === "medium") {
    return "Medium";
  }
  return "Low";
}

function buildHtml(productName: string, grouped: Map<string, DigestChange[]>): string {
  const sections: string[] = [];
  for (const [competitorName, items] of grouped) {
    const rows = items
      .map((item) => {
        const when = item.detectedAt.toISOString().slice(0, 10);
        const summary = escapeHtml(item.aiSummary ?? "(no summary)");
        const area = escapeHtml(item.relevantArea ?? "unspecified");
        const link = item.sourceUrl
          ? `<div style="margin-top:4px;font-size:12px;"><a href="${escapeHtml(item.sourceUrl)}">Source</a></div>`
          : "";
        return `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap;">${when}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${area}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${urgencyLabel(item.urgency)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${summary}${link}</td>
        </tr>`;
      })
      .join("");

    sections.push(`
      <h2 style="font-size:16px;margin:24px 0 8px;">${escapeHtml(competitorName)}</h2>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead>
          <tr style="background:#f3f4f6;text-align:left;">
            <th style="padding:8px 12px;">Date</th>
            <th style="padding:8px 12px;">Area</th>
            <th style="padding:8px 12px;">Urgency</th>
            <th style="padding:8px 12px;">Summary</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`);
  }

  return `<!DOCTYPE html>
<html>
<body style="font-family:Georgia,serif;color:#111;max-width:720px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;">Daily competitor digest for ${escapeHtml(productName)}</h1>
  <p style="color:#4b5563;">Meaningful product changes from the last 24 hours, grouped by competitor.</p>
  ${sections.join("\n")}
</body>
</html>`;
}

export async function sendEmailDigest(
  changeLogs: DigestChange[],
  userProduct: Pick<UserProduct, "name" | "ownerEmail">
): Promise<{ sent: boolean; skipped: string[]; emailed: string[] }> {
  if (changeLogs.length === 0) {
    return { sent: false, skipped: [], emailed: [] };
  }

  const ids = changeLogs.map((item) => item._id);
  const already = await AlertLogModel.find({
    changeLogId: { $in: ids },
    channel: "email",
  }).lean();
  const alreadyIds = new Set(already.map((row) => row.changeLogId.toString()));

  const fresh = changeLogs.filter((item) => !alreadyIds.has(item._id.toString()));
  const skipped = changeLogs
    .filter((item) => alreadyIds.has(item._id.toString()))
    .map((item) => item._id.toString());

  if (fresh.length === 0) {
    console.log(`Nothing new to email for ${userProduct.name} (all already in AlertLog).`);
    return { sent: false, skipped, emailed: [] };
  }

  if (!isSmtpConfigured()) {
    console.warn(
      "SMTP is not configured (need SMTP_HOST and EMAIL_FROM). Skipping send; no AlertLog written."
    );
    return { sent: false, skipped, emailed: [] };
  }

  const grouped = new Map<string, DigestChange[]>();
  for (const item of fresh) {
    const list = grouped.get(item.competitorName) ?? [];
    list.push(item);
    grouped.set(item.competitorName, list);
  }

  await sendMail({
    to: userProduct.ownerEmail,
    subject: `Competitor digest: ${fresh.length} update(s) for ${userProduct.name}`,
    html: buildHtml(userProduct.name, grouped),
  });

  const emailed: string[] = [];
  for (const item of fresh) {
    try {
      await AlertLogModel.create({
        changeLogId: item._id,
        channel: "email",
        sentAt: new Date(),
      });
      await ChangeLogModel.updateOne({ _id: item._id }, { $set: { notified: true } });
      emailed.push(item._id.toString());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`AlertLog write skipped for ${item._id.toString()}: ${message}`);
    }
  }

  return { sent: true, skipped, emailed };
}

export async function sendDigestsForAllProducts(): Promise<void> {
  const products = await UserProductModel.find().lean();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const product of products) {
    const competitors = await CompetitorModel.find({ userProductId: product._id }).lean();
    const competitorIds = competitors.map((row) => row._id);
    const nameById = new Map(competitors.map((row) => [row._id.toString(), row.name]));

    const logs = await ChangeLogModel.find({
      competitorId: { $in: competitorIds },
      isMeaningful: true,
      detectedAt: { $gte: since },
    })
      .sort({ detectedAt: -1 })
      .lean();

    const digestItems: DigestChange[] = logs.map((log) => {
      const raw = log.rawDiff as { url?: string } | null;
      return {
        _id: log._id,
        competitorId: log.competitorId,
        competitorName: nameById.get(log.competitorId.toString()) ?? "Unknown competitor",
        sourceType: log.sourceType,
        aiSummary: log.aiSummary ?? null,
        relevantArea: log.relevantArea ?? null,
        urgency: log.urgency ?? null,
        detectedAt: log.detectedAt,
        sourceUrl: raw?.url,
      };
    });

    console.log(
      `Digest for ${product.name} <${product.ownerEmail}>: ${digestItems.length} meaningful change(s) in last 24h`
    );
    await sendEmailDigest(digestItems, product);
  }
}
