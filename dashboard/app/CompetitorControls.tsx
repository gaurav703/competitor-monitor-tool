"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CompetitorControls({
  competitorId,
  name,
}: {
  competitorId: string;
  name: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function rename() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch("/api/competitors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: competitorId, name: trimmed }),
    });
    setBusy(false);
    if (!response.ok) {
      setError("Could not rename.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Delete competitor "${name}" and all of its history?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/competitors?id=${encodeURIComponent(competitorId)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!response.ok) {
      setError("Could not delete.");
      return;
    }
    router.refresh();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void rename();
            if (event.key === "Escape") {
              setEditing(false);
              setValue(name);
            }
          }}
          autoFocus
          className="w-44 rounded-lg border border-stone-300 px-2.5 py-1 text-sm text-stone-900 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
        />
        <button
          type="button"
          onClick={() => void rename()}
          disabled={busy}
          className="rounded-lg bg-stone-900 px-2.5 py-1 text-xs font-medium text-white transition-colors duration-150 hover:bg-stone-800 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(name);
          }}
          className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors duration-150 hover:bg-stone-50"
        >
          Cancel
        </button>
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-500 transition-colors duration-150 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-800"
      >
        Rename
      </button>
      <button
        type="button"
        onClick={() => void remove()}
        disabled={busy}
        className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-500 transition-colors duration-150 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      >
        Delete
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
