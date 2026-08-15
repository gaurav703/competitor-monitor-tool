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
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void run()}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-stone-800 active:bg-stone-950 disabled:opacity-50"
      >
        {pending ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Watching…
          </>
        ) : (
          <>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Run watch now
          </>
        )}
      </button>

      {error ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {summary ? (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          {/* Stat chips */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Sources", value: summary.total, color: "bg-stone-100 text-stone-700" },
              { label: "Changed", value: summary.changed, color: "bg-amber-50 text-amber-700" },
              { label: "Analyzed", value: summary.analyzed, color: "bg-sky-50 text-sky-700" },
              { label: "Duplicates", value: summary.duplicates, color: "bg-stone-100 text-stone-500" },
              { label: "Errors", value: summary.errors, color: summary.errors > 0 ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-500" },
              { label: "Paused", value: summary.skipped, color: "bg-stone-100 text-stone-500" },
            ].map((stat) => (
              <span key={stat.label} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${stat.color}`}>
                {stat.value} {stat.label}
              </span>
            ))}
          </div>

          {/* Errors */}
          {summary.rows.some((row) => row.error) ? (
            <div className="mt-3 space-y-1">
              {summary.rows
                .filter((row) => row.error)
                .map((row) => (
                  <div key={`${row.competitorName}-${row.sourceType}`} className="flex items-start gap-2 text-xs text-red-600">
                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <span>
                      <span className="font-medium">{row.competitorName}</span> · {row.sourceType}: {row.error}
                    </span>
                  </div>
                ))}
            </div>
          ) : null}

          <p className="mt-3 text-xs text-stone-400">
            First fetch of a source is a baseline (no Gemini). Refresh to see new changes.
          </p>
        </div>
      ) : null}
    </div>
  );
}
