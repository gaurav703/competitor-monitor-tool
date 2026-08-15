"use client";

import { useEffect, useRef, useState } from "react";

export function SourceSelector({
  competitorId,
  sourceId,
  initialSelector,
}: {
  competitorId: string;
  sourceId: string;
  initialSelector: string;
}) {
  const [value, setValue] = useState(initialSelector);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, []);

  async function save(next: string) {
    setStatus("saving");
    setError(null);
    try {
      const response = await fetch("/api/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorId, sourceId, selector: next }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setStatus("error");
        setError(payload.error ?? "Could not save selector.");
        return;
      }
      setStatus("saved");
    } catch {
      setStatus("error");
      setError("Could not save selector.");
    }
  }

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setValue(next);
    setStatus("idle");
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => {
      void save(next);
    }, 600);
  }

  return (
    <div className="mt-2">
      <label className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span className="font-medium text-stone-600">CSS selector</span>
        <input
          value={value}
          onChange={onChange}
          placeholder='e.g. ".changelog" or "#product-updates"'
          className="min-w-[200px] flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-800 placeholder:text-stone-400 transition-colors duration-150 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
        />
        {status === "saving" ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-stone-400">
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Saving
          </span>
        ) : status === "saved" ? (
          <span className="text-[11px] text-emerald-600">✓ Saved</span>
        ) : status === "error" ? (
          <span className="text-[11px] text-red-600">Error</span>
        ) : null}
      </label>
      <p className="mt-1 text-[11px] text-stone-400">
        Only changes inside this section count as updates. Leave empty to watch the whole page.
      </p>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
