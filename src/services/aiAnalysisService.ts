import { isGeminiConfigured } from "../config/env";
import type { SourceType, Urgency } from "../models";
import { URGENCY_LEVELS } from "../models";
import { generateGeminiText } from "./geminiClient";

export type UserProductContext = {
  name: string;
  industry: string;
  description: string;
};

export type DiffForAnalysis = {
  url: string;
  isFirstCheck: boolean;
  previousHash: string | null;
  currentHash: string;
  content: string;
};

export type ChangeAnalysis = {
  isMeaningful: boolean;
  aiSummary: string | null;
  relevantArea: string | null;
  urgency: Urgency | null;
};

const FALLBACK: ChangeAnalysis = {
  isMeaningful: false,
  aiSummary: null,
  relevantArea: null,
  urgency: null,
};

const MAX_CONTENT_CHARS = 8000;

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in model response");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

function asUrgency(value: unknown): Urgency | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.toLowerCase().trim();
  if ((URGENCY_LEVELS as readonly string[]).includes(normalized)) {
    return normalized as Urgency;
  }
  return null;
}

function toAnalysis(raw: unknown): ChangeAnalysis {
  if (!raw || typeof raw !== "object") {
    return FALLBACK;
  }
  const data = raw as Record<string, unknown>;
  const isMeaningful = Boolean(data.isMeaningful);
  const aiSummary = typeof data.aiSummary === "string" ? data.aiSummary.trim() : "";
  const relevantArea = typeof data.relevantArea === "string" ? data.relevantArea.trim() : "";
  const urgency = asUrgency(data.urgency);

  if (!isMeaningful) {
    return {
      isMeaningful: false,
      aiSummary: aiSummary || null,
      relevantArea: relevantArea || null,
      urgency: urgency,
    };
  }

  return {
    isMeaningful: true,
    aiSummary: aiSummary || null,
    relevantArea: relevantArea || "unspecified",
    urgency: urgency ?? "low",
  };
}

function buildPrompt(userProduct: UserProductContext, competitorName: string, sourceType: SourceType, rawDiff: DiffForAnalysis): string {
  const content = rawDiff.content.length > MAX_CONTENT_CHARS
    ? `${rawDiff.content.slice(0, MAX_CONTENT_CHARS)}\n[truncated]`
    : rawDiff.content;

  return `Competitor: ${competitorName}
Source type: ${sourceType}
Source URL: ${rawDiff.url}
First check (baseline): ${rawDiff.isFirstCheck}
Previous hash: ${rawDiff.previousHash ?? "(none)"}
Current hash: ${rawDiff.currentHash}

Fetched content / canonical text:
${content}

Respond with JSON only, using this shape:
{
  "isMeaningful": boolean,
  "aiSummary": string,
  "relevantArea": string,
  "urgency": "low" | "medium" | "high"
}

Rules:
- isMeaningful is true only for a real product, feature, pricing, positioning, go-to-market change, or a news/blog article that reports such a change.
- For source type "news", treat new headlines about funding, launches, regulation, or product moves as potentially meaningful; ignore generic market roundups that only mention the name in passing.
- isMeaningful is false for noise: typo fixes, generic "bug fixes and improvements", minor copy edits, cookie banners, nav tweaks, or unchanged marketing fluff.
- If meaningful, aiSummary must be 2-3 sentences about why this matters to the founder of ${userProduct.name}.
- relevantArea is a short free-text label inferred from context (examples: pricing, onboarding, core feature, integrations, mobile UX) — not a fixed enum.
- urgency is how much this matters specifically to ${userProduct.name}, not to the market in general.
- If not meaningful, still return JSON with isMeaningful false; aiSummary may be brief or empty; urgency may be "low".`;
}

export async function analyzeChange(
  userProduct: UserProductContext,
  competitorName: string,
  sourceType: SourceType,
  rawDiff: DiffForAnalysis
): Promise<ChangeAnalysis> {
  if (!isGeminiConfigured()) {
    console.warn("GEMINI_API_KEY is missing; storing ChangeLog as not meaningful (fallback).");
    return FALLBACK;
  }

  try {
    const text = await generateGeminiText({
      systemInstruction: `You are a competitive intelligence analyst for the founder of ${userProduct.name}, a ${userProduct.industry} product described as: ${userProduct.description}. Judge every change only by how it affects THIS founder's product. Return strict JSON. No markdown.`,
      input: buildPrompt(userProduct, competitorName, sourceType, rawDiff),
    });
    return toAnalysis(extractJsonObject(text));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Gemini analysis fallback: ${message}`);
    return FALLBACK;
  }
}
