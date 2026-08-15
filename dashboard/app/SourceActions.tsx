"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SourceActions({
  competitorId,
  sourceId,
  enabled,
}: {
  competitorId: string;
  sourceId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/sources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitorId, sourceId, enabled: !enabled }),
    });
    setBusy(false);
    if (!response.ok) {
      setError("Could not update source.");
      return;
    }
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Remove this source from the competitor?")) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(
      `/api/sources?competitorId=${encodeURIComponent(competitorId)}&sourceId=${encodeURIComponent(sourceId)}`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (!response.ok) {
      setError("Could not remove source.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="mt-1 inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        className="rounded border border-stone-300 px-2 py-0.5 text-[11px] text-stone-700 disabled:opacity-50"
      >
        {enabled ? "Pause" : "Resume"}
      </button>
      <button
        type="button"
        onClick={() => void remove()}
        disabled={busy}
        className="rounded border border-red-200 px-2 py-0.5 text-[11px] text-red-700 disabled:opacity-50"
      >
        Remove
      </button>
      {error ? <span className="text-[11px] text-red-700">{error}</span> : null}
    </span>
  );
}
