"use client";

import { useState } from "react";

type Row = {
  competitorName: string;
  sourceType: string;
  changed: boolean;
  analyzed: boolean;
  deduped: boolean;
  skipped: boolean;
  isFirstCheck: boolean;
  meaningful: boolean | null;
  error: string | null;
};

type Summary = {
  total: number;
  changed: number;
  analyzed: number;
  duplicates: number;
  errors: number;
  skipped: number;
  rows: Row[];
};

export function WatchButton({ userProductId }: { userProductId: string }) {
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    setSummary(null);
    try {
      const response = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProductId }),
      });
      const payload = (await response.json()) as { summary?: Summary; error?: string };
      if (!response.ok || !payload.summary) {
        setError(payload.error ?? "Watch run failed.");
        return;
      }
      setSummary(payload.summary);
    } catch {
      setError("Watch run failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={pending}
        className="rounded bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Watching…" : "Run watch now"}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {summary ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700">
          <p className="font-medium text-stone-800">
            {summary.total} source(s) · {summary.analyzed} analyzed · {summary.changed} changed ·{" "}
            {summary.duplicates} duplicate(s) · {summary.errors} error(s) · {summary.skipped} paused
          </p>
          {summary.rows.some((row) => row.error) ? (
            <ul className="mt-2 space-y-1">
              {summary.rows
                .filter((row) => row.error)
                .map((row) => (
                  <li key={`${row.competitorName}-${row.sourceType}`} className="text-red-700">
                    {row.competitorName} · {row.sourceType}: {row.error}
                  </li>
                ))}
            </ul>
          ) : null}
          <p className="mt-2 text-stone-500">First fetch of a source is a baseline (no Gemini). Refresh to see new changes.</p>
        </div>
      ) : null}
    </div>
  );
}
