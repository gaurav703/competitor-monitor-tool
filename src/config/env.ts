import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  geminiApiKey: optional("GEMINI_API_KEY"),
  geminiModel: optional("GEMINI_MODEL", "gemini-3.6-flash"),
  /**
   * Models tried after the primary when it hits a quota/transient error.
   * Comma-separated env var (GEMINI_MODEL_FALLBACKS), e.g.
   * "gemini-2.5-flash,gemini-2.0-flash". Empty by default, so the cascade
   * is a no-op unless explicitly configured.
   */
  geminiModelFallbacks: optional("GEMINI_MODEL_FALLBACKS")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean),
  mongodbUri: required("MONGODB_URI"),
  smtpHost: optional("SMTP_HOST"),
  smtpPort: Number(optional("SMTP_PORT", "587")),
  smtpUser: optional("SMTP_USER"),
  smtpPass: optional("SMTP_PASS"),
  emailFrom: optional("EMAIL_FROM"),
};

export function isSmtpConfigured(): boolean {
  return Boolean(env.smtpHost && env.emailFrom);
}

export function isGeminiConfigured(): boolean {
  return Boolean(env.geminiApiKey);
}
