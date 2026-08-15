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
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        className="rounded-md border border-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-500 transition-colors duration-150 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-800 disabled:opacity-50"
      >
        {enabled ? "Pause" : "Resume"}
      </button>
      <button
        type="button"
        onClick={() => void remove()}
        disabled={busy}
        className="rounded-md border border-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-500 transition-colors duration-150 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      >
        Remove
      </button>
      {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
    </span>
  );
}
