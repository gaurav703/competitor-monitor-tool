"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SOURCE_TYPES = ["website", "blog_rss", "news", "playstore", "appstore"];

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
        className="mt-2 rounded border border-stone-300 px-2 py-1 text-xs text-stone-700"
      >
        + Add source
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded border border-stone-200 bg-stone-50 p-3">
      <label className="block text-xs">
        <span className="mb-1 block font-medium text-stone-700">Type</span>
        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="w-full rounded border border-stone-300 px-2 py-1 text-xs"
        >
          {SOURCE_TYPES.map((row) => (
            <option key={row} value={row}>
              {row}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium text-stone-700">URL</span>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://competitor.com/changelog or RSS/feed URL or store listing"
          className="w-full rounded border border-stone-300 px-2 py-1 text-xs"
        />
      </label>
      {type === "website" ? (
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-stone-700">
            CSS selector <span className="font-normal text-stone-400">(optional)</span>
          </span>
          <input
            value={selector}
            onChange={(event) => setSelector(event.target.value)}
            placeholder='e.g. ".changelog"'
            className="w-full rounded border border-stone-300 px-2 py-1 text-xs"
          />
        </label>
      ) : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void add()}
          disabled={pending}
          className="rounded bg-stone-900 px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add source"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-stone-300 px-3 py-1 text-xs text-stone-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
