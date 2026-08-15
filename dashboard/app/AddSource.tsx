"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SOURCE_TYPES = ["website", "blog_rss", "news", "playstore", "appstore"];

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 placeholder:text-stone-400 transition-colors duration-150 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10";

export function AddSource({ competitorId }: { competitorId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("website");
  const [url, setUrl] = useState("");
  const [selector, setSelector] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function add() {
    if (!url.trim()) {
      setError("URL is required.");
      return;
    }
    setPending(true);
    setError(null);
    const response = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitorId, type, url, selector }),
    });
    setPending(false);
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Could not add source.");
      return;
    }
    setUrl("");
    setSelector("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1 rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-500 transition-colors duration-150 hover:border-stone-400 hover:bg-stone-50 hover:text-stone-700"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add source
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-stone-700">New source</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-stone-400 transition-colors duration-150 hover:text-stone-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-stone-600">Type</span>
          <select value={type} onChange={(event) => setType(event.target.value)} className={inputClass}>
            {SOURCE_TYPES.map((row) => (
              <option key={row} value={row}>
                {row}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-stone-600">URL</span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://competitor.com/changelog"
            className={inputClass}
          />
        </label>
        {type === "website" ? (
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-stone-600">
              CSS selector <span className="font-normal text-stone-400">(optional)</span>
            </span>
            <input
              value={selector}
              onChange={(event) => setSelector(event.target.value)}
              placeholder='e.g. ".changelog"'
              className={inputClass}
            />
          </label>
        ) : null}
      </div>
      {error ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void add()}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition-all duration-150 hover:bg-stone-800 disabled:opacity-50"
        >
          {pending ? (
            <>
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Adding…
            </>
          ) : (
            "Add source"
          )}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors duration-150 hover:bg-stone-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
