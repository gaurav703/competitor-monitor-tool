import nodemailer from "nodemailer";
import { env, isSmtpConfigured } from "../config/env";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function urgencyPillStyle(urgency: string | null | undefined): string {
  if (urgency === "high") {
    return "background:#fee2e2;color:#991b1b;";
  }
  if (urgency === "medium") {
    return "background:#fef3c7;color:#92400e;";
  }
  return "background:#d1fae5;color:#065f46;";
}

/** Inline pill tags matching the timeline (area, urgency, source type). */
export function updateTagHtml(params: {
  relevantArea?: string | null;
  urgency?: string | null;
  sourceType?: string | null;
}): string {
  const area = escapeHtml(params.relevantArea?.trim() || "unspecified");
  const urgency = params.urgency === "high" || params.urgency === "medium" || params.urgency === "low" ? params.urgency : null;
  const type = params.sourceType?.trim() ? escapeHtml(params.sourceType) : "";
  const pills = [
    `<span style="display:inline-block;border-radius:999px;padding:2px 8px;font-size:12px;background:#f5f5f4;color:#44403c;">${area}</span>`,
  ];
  if (urgency) {
    pills.push(
      `<span style="display:inline-block;border-radius:999px;padding:2px 8px;font-size:12px;${urgencyPillStyle(urgency)}">${escapeHtml(urgency)}</span>`
    );
  }
  if (type) {
    pills.push(`<span style="color:#a8a29e;">${type}</span>`);
  }
  return pills.join(" ");
}

export async function sendMail(params: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!isSmtpConfigured()) {
    console.warn("SMTP is not configured (need SMTP_HOST and EMAIL_FROM). Skipping send.");
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  });

  await transporter.sendMail({
    from: env.emailFrom,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  return true;
}
