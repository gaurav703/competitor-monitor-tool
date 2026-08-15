import nodemailer from "nodemailer";
import { env, isSmtpConfigured } from "../config/env";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
