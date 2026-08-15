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

  const statusLabel =
    status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Error" : "";

  return (
    <div className="mt-2">
      <label className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span className="font-medium text-stone-700">Watch CSS selector</span>
        <input
          value={value}
          onChange={onChange}
          placeholder='e.g. ".changelog" or "#product-updates"'
          className="min-w-[220px] flex-1 rounded border border-stone-300 px-2 py-1 text-xs text-stone-800"
        />
        {statusLabel ? (
          <span className={status === "error" ? "text-red-700" : "text-emerald-700"}>{statusLabel}</span>
        ) : null}
      </label>
      <p className="mt-1 text-[11px] text-stone-400">
        Only changes inside this section count as updates. Leave empty to watch the whole page.
      </p>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
