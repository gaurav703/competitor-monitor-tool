export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractPlayStoreAppId(urlOrId: string): string {
  const trimmed = urlOrId.trim();
  try {
    const parsed = new URL(trimmed);
    const id = parsed.searchParams.get("id");
    if (id) {
      return id;
    }
  } catch {
    // not a URL — treat as a raw application id
  }
  if (/^[a-zA-Z][\w.]*\.\w+/.test(trimmed)) {
    return trimmed;
  }
  throw new Error(`Could not parse a Play Store app id from: ${urlOrId}`);
}

export function extractAppStoreId(urlOrId: string): { id: number; country: string } {
  const trimmed = urlOrId.trim();
  if (/^\d+$/.test(trimmed)) {
    return { id: Number(trimmed), country: "us" };
  }

  try {
    const parsed = new URL(trimmed);
    const countryMatch = parsed.pathname.match(/^\/([a-z]{2})\//i);
    const country = countryMatch?.[1]?.toLowerCase() ?? "us";
    const idMatch = parsed.pathname.match(/id(\d+)/i);
    if (idMatch?.[1]) {
      return { id: Number(idMatch[1]), country };
    }
  } catch {
    // not a URL
  }

  throw new Error(`Could not parse an App Store numeric id from: ${urlOrId}`);
}
