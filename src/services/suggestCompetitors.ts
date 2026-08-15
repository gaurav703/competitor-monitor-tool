import { isGeminiConfigured } from "../config/env";
import type { UserProductContext } from "./aiAnalysisService";
import { generateGeminiText } from "./geminiClient";

export type CompetitorSuggestion = {
  name: string;
  why: string;
};

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

function parseSuggestions(raw: unknown, exclude: Set<string>): CompetitorSuggestion[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const data = raw as { competitors?: unknown };
  if (!Array.isArray(data.competitors)) {
    return [];
  }

  const seen = new Set<string>();
  const suggestions: CompetitorSuggestion[] = [];
  for (const row of data.competitors) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const item = row as { name?: unknown; why?: unknown };
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    if (exclude.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    suggestions.push({
      name,
      why: typeof item.why === "string" ? item.why.trim() : "",
    });
  }
  return suggestions.slice(0, 8);
}

export async function suggestCompetitorsForProduct(
  product: UserProductContext,
  alreadyWatching: string[] = []
): Promise<CompetitorSuggestion[]> {
  if (!isGeminiConfigured()) {
    throw new Error("GEMINI_API_KEY is missing. Add it to .env to get suggested competitors.");
  }

  const exclude = new Set(alreadyWatching.map((name) => name.toLowerCase()));
  const text = await generateGeminiText({
    systemInstruction:
      "You are a competitive intelligence analyst. Suggest real, currently operating product rivals. Return strict JSON only.",
    input: `Product name: ${product.name}
Industry: ${product.industry}
Description: ${product.description}
Already watching (do not repeat): ${alreadyWatching.join(", ") || "(none)"}

Return JSON:
{"competitors":[{"name":"Public product or company name","why":"One short sentence why they compete with THIS product"}]}

Rules:
- 5 to 8 direct competitors for THIS product, not the whole industry.
- Use the well-known consumer/app name (e.g. Groww, Zerodha Kite, PhonePe), not a legal entity dump.
- Prefer products with a Play Store or App Store listing.
- No made-up companies.`,
  });

  return parseSuggestions(extractJsonObject(text), exclude);
}
